import { parse as flatParse, stringify as flatStringify } from 'flatted';
import {
  DEFAULT_NATIVE_SCRIPT_VITEST_PORT,
  NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION,
  isNativeScriptVitestWireMessage,
  type NativeScriptTestEvent,
  type NativeScriptTestEventListener,
  type NativeScriptTestEventSource,
  type NativeScriptVitestWireMessage,
} from '../protocol.js';
import { createMainThreadWorkerHandle } from './loopback.js';
import type { NativeScriptTestModuleRegistry } from './registry.js';

interface MessageEventLike {
  data: unknown;
}

interface ErrorEventLike {
  message?: string;
}

type EventHandler<Event> = {
  bivarianceHack(event: Event): void;
}['bivarianceHack'];

export interface NativeScriptWorkerHandle {
  onmessage: EventHandler<MessageEventLike> | null;
  onerror: EventHandler<ErrorEventLike> | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export interface NativeScriptWebSocketHandle {
  readonly readyState?: number;
  onopen: (() => void) | null;
  onmessage: ((event: MessageEventLike) => void) | null;
  onerror: ((event: ErrorEventLike) => void) | null;
  onclose: (() => void) | null;
  send(message: string): void;
  close(): void;
}

export interface NativeScriptVitestCoordinatorOptions {
  /** Required to execute main-thread (UI-capable) specs — slot 0. */
  registry?: NativeScriptTestModuleRegistry;
  /** Required to execute specs in parallel NativeScript Worker runtimes. */
  createWorker?(slot: number): NativeScriptWorkerHandle;
  url?: string;
  port?: number;
  createSocket?: (url: string) => NativeScriptWebSocketHandle;
  /** Delay between connection retry cycles across all candidate URLs. */
  connectRetryDelay?: number;
  maxConnectCycles?: number;
  /** How long a single candidate URL may take to open before trying the next. */
  candidateTimeout?: number;
}

/** Injected by the webpack helper via DefinePlugin for `--env.unitTesting` builds. */
declare const __NS_TEST_CONFIG__: { port?: number } | undefined;

function injectedTestConfig(): { port?: number } | undefined {
  return typeof __NS_TEST_CONFIG__ !== 'undefined'
    ? __NS_TEST_CONFIG__
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Candidate order matters: Android emulators reach the host only via
 * 10.0.2.2, while physical Android devices reach 127.0.0.1 through the
 * `adb reverse` mapping the host session establishes. iOS and visionOS
 * simulators share the host loopback; physical Apple devices need an
 * explicit `url`.
 */
export function defaultNativeScriptVitestUrls(
  port = DEFAULT_NATIVE_SCRIPT_VITEST_PORT,
): string[] {
  const isAndroidRuntime = 'android' in globalThis;
  return isAndroidRuntime
    ? [`ws://10.0.2.2:${port}`, `ws://127.0.0.1:${port}`]
    : [`ws://127.0.0.1:${port}`];
}

function defaultSocketFactory(url: string): NativeScriptWebSocketHandle {
  const WebSocketConstructor = (
    globalThis as unknown as {
      WebSocket?: new (address: string) => NativeScriptWebSocketHandle;
    }
  ).WebSocket;
  if (!WebSocketConstructor) {
    throw new Error('NativeScript WebSocket global is unavailable');
  }
  return new WebSocketConstructor(url);
}

export class NativeScriptVitestCoordinator
  implements NativeScriptTestEventSource
{
  private readonly listeners = new Set<NativeScriptTestEventListener>();
  private readonly workers = new Map<number, NativeScriptWorkerHandle>();
  private socket: NativeScriptWebSocketHandle | undefined;
  private startPromise: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly options: NativeScriptVitestCoordinatorOptions) {}

  subscribe(listener: NativeScriptTestEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): Promise<void> {
    this.startPromise ??= this.connect();
    return this.startPromise;
  }

  stop(): void {
    this.stopped = true;
    this.workers.forEach((worker) => {
      worker.postMessage({ kind: 'stop' });
      worker.terminate();
    });
    this.workers.clear();
    this.socket?.close();
    this.socket = undefined;
    this.startPromise = undefined;
  }

  private async connect(): Promise<void> {
    const port =
      this.options.port ??
      injectedTestConfig()?.port ??
      DEFAULT_NATIVE_SCRIPT_VITEST_PORT;
    const candidates = this.options.url
      ? [this.options.url]
      : defaultNativeScriptVitestUrls(port);
    const retryDelay = this.options.connectRetryDelay ?? 2_000;
    const maxCycles = this.options.maxConnectCycles ?? 60;

    let lastError = new Error('NativeScript Vitest socket failed');
    for (let cycle = 0; cycle < maxCycles && !this.stopped; cycle += 1) {
      for (const url of candidates) {
        if (this.stopped) return;
        try {
          await this.attemptConnection(url);
          return;
        } catch (error) {
          lastError =
            error instanceof Error ? error : new Error(String(error));
        }
      }
      await delay(retryDelay);
    }

    if (this.stopped) return;
    this.emit({ type: 'worker-error', worker: 0, message: lastError.message });
    throw lastError;
  }

  private attemptConnection(url: string): Promise<void> {
    const socket = (this.options.createSocket ?? defaultSocketFactory)(url);
    const candidateTimeout = this.options.candidateTimeout ?? 4_000;

    return new Promise<void>((resolve, reject) => {
      let opened = false;
      let openPoll: ReturnType<typeof setInterval> | undefined;
      const openTimer = setTimeout(() => {
        if (opened) return;
        clearOpenPoll();
        // Reject before close(): a polyfill may dispatch onclose synchronously,
        // and its generic rejection would otherwise mask this URL-bearing one.
        reject(new Error(`NativeScript Vitest socket timed out: ${url}`));
        socket.close();
      }, candidateTimeout);
      const clearOpenPoll = (): void => {
        if (openPoll !== undefined) clearInterval(openPoll);
        openPoll = undefined;
        clearTimeout(openTimer);
      };
      const handleOpen = (): void => {
        if (opened) return;
        opened = true;
        clearOpenPoll();
        this.socket = socket;
        this.sendWire({
          kind: 'hello',
          protocol: NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION,
        });
        resolve();
      };
      socket.onopen = handleOpen;
      socket.onmessage = (event) => this.onSocketMessage(event.data);
      socket.onerror = (event) => {
        clearOpenPoll();
        const message = event.message ?? 'NativeScript Vitest socket failed';
        if (!opened) {
          reject(new Error(message));
          return;
        }
        this.emit({ type: 'worker-error', worker: 0, message });
      };
      socket.onclose = () => {
        clearOpenPoll();
        if (this.socket === socket) this.socket = undefined;
        if (!opened) reject(new Error('NativeScript Vitest socket closed'));
      };
      // Browser WebSockets always dispatch `open` asynchronously, but some
      // NativeScript polyfills can finish a loopback connection in their
      // constructor before the coordinator assigns `onopen`.
      if (socket.readyState === 1) handleOpen();
      else if (socket.readyState !== undefined) {
        openPoll = setInterval(() => {
          if (socket.readyState === 1) handleOpen();
        }, 25);
      }
    });
  }

  private onSocketMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    const message = flatParse(raw);
    if (!isNativeScriptVitestWireMessage(message)) return;

    if (message.kind === 'configure') {
      this.configureWorkers(message.main, message.workers);
      return;
    }
    if (message.kind === 'worker-message') {
      this.workers.get(message.slot)?.postMessage({
        kind: 'pool-message',
        frame: message.frame,
      });
      return;
    }
    if (message.kind === 'error') {
      this.emit({ type: 'worker-error', worker: 0, message: message.message });
    }
  }

  private configureWorkers(main: boolean, workerCount: number): void {
    if (main && !this.workers.has(0)) {
      if (this.options.registry) {
        this.attachWorker(0, createMainThreadWorkerHandle(this.options.registry));
      } else {
        this.reportConfigurationError(
          'NativeScript Vitest coordinator needs a `registry` to run main-thread specs',
        );
      }
    }

    const firstWorkerSlot = main ? 1 : 0;
    for (let index = 0; index < workerCount; index += 1) {
      const slot = firstWorkerSlot + index;
      if (this.workers.has(slot)) continue;
      if (!this.options.createWorker) {
        this.reportConfigurationError(
          'NativeScript Vitest coordinator needs `createWorker` to run Worker specs',
        );
        return;
      }
      this.attachWorker(slot, this.options.createWorker(slot));
    }
  }

  private attachWorker(slot: number, worker: NativeScriptWorkerHandle): void {
    worker.onmessage = (event) => this.onWorkerMessage(slot, event.data);
    worker.onerror = (event) => {
      this.emit({
        type: 'worker-error',
        worker: slot,
        message: event.message ?? `NativeScript worker ${slot} failed`,
      });
    };
    this.workers.set(slot, worker);
  }

  private reportConfigurationError(message: string): void {
    this.sendWire({ kind: 'error', message });
    this.emit({ type: 'worker-error', worker: 0, message });
  }

  private onWorkerMessage(slot: number, message: unknown): void {
    if (!isRecord(message) || typeof message.kind !== 'string') return;

    if (message.kind === 'runtime-ready') {
      this.workers.get(slot)?.postMessage({ kind: 'start', slot });
      return;
    }
    if (message.kind === 'worker-ready') {
      this.sendWire({ kind: 'worker-ready', slot });
      return;
    }
    if (message.kind === 'pool-message' && typeof message.frame === 'string') {
      this.sendWire({ kind: 'worker-message', slot, frame: message.frame });
      return;
    }
    if (message.kind === 'test-event' && isRecord(message.event)) {
      this.emit(message.event as unknown as NativeScriptTestEvent);
    }
  }

  private sendWire(message: NativeScriptVitestWireMessage): void {
    this.socket?.send(flatStringify(message));
  }

  private emit(event: NativeScriptTestEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
