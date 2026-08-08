import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { parse as flatParse, stringify as flatStringify } from 'flatted';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION,
  isNativeScriptVitestWireMessage,
  type NativeScriptVitestWireMessage,
} from '../protocol.js';
import type { ResolvedNativeScriptPluginOptions } from './options.js';

type MessageListener = (message: unknown) => void;

export interface NativeScriptPoolSession {
  retain(): void;
  release(): Promise<void>;
  start(): Promise<void>;
  waitForWorker(slot: number): Promise<void>;
  send(slot: number, message: unknown): void;
  subscribe(slot: number, listener: MessageListener): () => void;
}

interface ReadyDeferred {
  promise: Promise<void>;
  resolve: () => void;
}

function createReadyDeferred(): ReadyDeferred {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

const ADB_REVERSE_RETRY_INTERVAL = 3_000;

export class WebSocketNativeScriptPoolSession
  implements NativeScriptPoolSession
{
  private server: WebSocketServer | undefined;
  private socket: WebSocket | undefined;
  private child: ChildProcess | undefined;
  private adbReverseTimer: ReturnType<typeof setInterval> | undefined;
  private startPromise: Promise<void> | undefined;
  private closePromise: Promise<void> | undefined;
  private references = 0;
  private readonly ready = new Map<number, ReadyDeferred>();
  private readonly readySlots = new Set<number>();
  private readonly listeners = new Map<number, Set<MessageListener>>();

  constructor(
    private readonly options: ResolvedNativeScriptPluginOptions,
  ) {}

  retain(): void {
    this.references += 1;
  }

  async release(): Promise<void> {
    this.references = Math.max(0, this.references - 1);
    if (this.references === 0) await this.close();
  }

  start(): Promise<void> {
    this.startPromise ??= this.startServerAndApp();
    return this.startPromise;
  }

  async waitForWorker(slot: number): Promise<void> {
    if (this.readySlots.has(slot)) return;

    const deferred = this.getReady(slot);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `NativeScript Vitest worker ${slot} did not connect within ${this.options.connectTimeout}ms`,
          ),
        );
      }, this.options.connectTimeout);
      timer.unref?.();

      void deferred.promise.then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  send(slot: number, message: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('NativeScript Vitest coordinator is not connected');
    }

    this.sendWire({
      kind: 'worker-message',
      slot,
      frame: flatStringify(message),
    });
  }

  subscribe(slot: number, listener: MessageListener): () => void {
    let slotListeners = this.listeners.get(slot);
    if (!slotListeners) {
      slotListeners = new Set();
      this.listeners.set(slot, slotListeners);
    }
    slotListeners.add(listener);
    return () => slotListeners?.delete(listener);
  }

  private getReady(slot: number): ReadyDeferred {
    let deferred = this.ready.get(slot);
    if (!deferred) {
      deferred = createReadyDeferred();
      this.ready.set(slot, deferred);
    }
    return deferred;
  }

  private async startServerAndApp(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const server = new WebSocketServer({
        host: this.options.host,
        port: this.options.port,
      });
      this.server = server;
      const onError = (error: Error): void => reject(error);
      server.once('error', onError);
      server.once('listening', () => {
        server.off('error', onError);
        resolve();
      });
      server.on('connection', (socket) => this.acceptConnection(socket));
    });

    this.startAdbReverse();
    if (this.options.launch) this.launchApp();
  }

  /**
   * `adb reverse` only succeeds once the device/emulator is online, which may
   * be well after `ns run` starts (emulator boot), so retry until a
   * coordinator connects. Failures are silent: emulators reach the host via
   * 10.0.2.2 without it, and the coordinator tries both loopback candidates.
   */
  private startAdbReverse(): void {
    if (this.options.platform !== 'android' || !this.options.adbReverse) {
      return;
    }

    const args = [
      ...(this.options.device ? ['-s', this.options.device] : []),
      'reverse',
      `tcp:${this.options.port}`,
      `tcp:${this.options.port}`,
    ];
    const attempt = (): void => {
      execFile(this.options.adbPath, args, () => undefined);
    };

    attempt();
    this.adbReverseTimer = setInterval(attempt, ADB_REVERSE_RETRY_INTERVAL);
    this.adbReverseTimer.unref?.();
  }

  private stopAdbReverse(): void {
    if (this.adbReverseTimer !== undefined) {
      clearInterval(this.adbReverseTimer);
    }
    this.adbReverseTimer = undefined;
  }

  private launchApp(): void {
    const { command, args } = this.options.launchCommand;
    this.child = spawn(command, args, {
      cwd: this.options.appPath,
      env: process.env,
      stdio: 'inherit',
    });
    this.child.once('error', (error) => this.reportSessionError(error));
    this.child.once('exit', (code, signal) => {
      if (code === 0 || signal === 'SIGTERM') return;
      this.reportSessionError(
        new Error(
          `NativeScript CLI exited before tests completed (${signal ?? code ?? 'unknown'})`,
        ),
      );
    });
  }

  private acceptConnection(socket: WebSocket): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      this.socket.close(1013, 'A NativeScript Vitest coordinator is active');
    }

    this.stopAdbReverse();
    this.socket = socket;
    socket.on('message', (raw) => this.onMessage(raw));
    socket.on('close', () => {
      if (this.socket === socket) this.socket = undefined;
    });
    socket.on('error', (error) => this.reportSessionError(error));
  }

  private onMessage(raw: RawData): void {
    let message: unknown;
    try {
      message = flatParse(raw.toString());
    } catch (error) {
      this.reportSessionError(
        new Error(`Invalid NativeScript Vitest frame: ${String(error)}`),
      );
      return;
    }

    if (!isNativeScriptVitestWireMessage(message)) {
      this.reportSessionError(
        new Error('Received an invalid NativeScript Vitest protocol message'),
      );
      return;
    }

    switch (message.kind) {
      case 'hello':
        this.sendWire({
          kind: 'configure',
          protocol: NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION,
          main: this.options.slots.main,
          workers: this.options.slots.workers,
        });
        return;
      case 'worker-ready':
        this.readySlots.add(message.slot);
        this.getReady(message.slot).resolve();
        return;
      case 'worker-message': {
        const payload = flatParse(message.frame);
        this.listeners
          .get(message.slot)
          ?.forEach((listener) => listener(payload));
        return;
      }
      case 'error':
        this.reportSessionError(new Error(message.message));
        return;
      case 'configure':
        return;
    }
  }

  private sendWire(message: NativeScriptVitestWireMessage): void {
    this.socket?.send(flatStringify(message));
  }

  private reportSessionError(error: Error): void {
    const response = {
      __vitest_worker_response__: true,
      type: 'testfileFinished',
      error,
    };
    this.listeners.forEach((slotListeners) => {
      slotListeners.forEach((listener) => listener(response));
    });
  }

  private close(): Promise<void> {
    this.closePromise ??= this.doClose();
    return this.closePromise;
  }

  private async doClose(): Promise<void> {
    this.stopAdbReverse();
    if (this.child && !this.child.killed) this.child.kill('SIGTERM');
    this.child = undefined;

    // Close with a proper close frame — an abrupt terminate() surfaces as a
    // connection error on the device (okhttp), not a clean close, and the
    // on-device UI would report a healthy run as failed.
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.close(1000, 'NativeScript Vitest session complete');
      const failsafe = setTimeout(() => socket.terminate(), 1_500);
      failsafe.unref?.();
    }

    const server = this.server;
    this.server = undefined;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}
