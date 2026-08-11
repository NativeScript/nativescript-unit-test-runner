import { parse as flatParse, stringify as flatStringify } from 'flatted';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NativeScriptTestEvent } from '../protocol.js';
import {
  NativeScriptVitestCoordinator,
  defaultNativeScriptVitestUrls,
  type NativeScriptWebSocketHandle,
  type NativeScriptWorkerHandle,
} from './coordinator.js';
import type { NativeScriptTestModuleRegistry } from './registry.js';

class FakeSocket implements NativeScriptWebSocketHandle {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: string[] = [];

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: flatStringify(message) });
  }

  wire(): unknown[] {
    return this.sent.map((frame) => flatParse(frame));
  }
}

class FakeWorker implements NativeScriptWorkerHandle {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  readonly messages: unknown[] = [];
  readonly terminate = vi.fn();

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: message });
  }
}

const registry: NativeScriptTestModuleRegistry = { load: () => undefined };

function withAndroidRuntime(run: () => void): void {
  Object.defineProperty(globalThis, 'android', {
    value: {},
    configurable: true,
  });
  try {
    run();
  } finally {
    delete (globalThis as Record<string, unknown>).android;
  }
}

describe('defaultNativeScriptVitestUrls', () => {
  it('targets host loopback off Android', () => {
    expect(defaultNativeScriptVitestUrls(1234)).toEqual([
      'ws://127.0.0.1:1234',
    ]);
  });

  it('prefers the Android emulator host alias before the adb reverse mapping', () => {
    withAndroidRuntime(() => {
      expect(defaultNativeScriptVitestUrls(1234)).toEqual([
        'ws://10.0.2.2:1234',
        'ws://127.0.0.1:1234',
      ]);
    });
  });

  it('falls back to the protocol default port', () => {
    expect(defaultNativeScriptVitestUrls()).toEqual([
      'ws://127.0.0.1:17878',
    ]);
  });
});

describe('NativeScriptVitestCoordinator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts when a NativeScript socket opened during construction', async () => {
    const socket = new FakeSocket();
    socket.readyState = 1;
    const coordinator = new NativeScriptVitestCoordinator({
      createSocket: () => socket,
      createWorker: () => new FakeWorker(),
    });

    await coordinator.start();

    expect(socket.wire()[0]).toMatchObject({ kind: 'hello' });
  });

  it('detects a polyfill that changes readyState without firing onopen', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const coordinator = new NativeScriptVitestCoordinator({
      createSocket: () => socket,
      createWorker: () => new FakeWorker(),
    });

    const started = coordinator.start();
    socket.readyState = 1;
    await vi.advanceTimersByTimeAsync(25);
    await started;

    expect(socket.wire()[0]).toMatchObject({ kind: 'hello' });
  });

  it('falls through to the next candidate when one never opens', async () => {
    const attempted: string[] = [];
    let started: Promise<void> | undefined;
    // Candidates are resolved synchronously by `start`, so the Android marker
    // has to be in place for that call, not merely for the constructor.
    withAndroidRuntime(() => {
      started = new NativeScriptVitestCoordinator({
        createWorker: () => new FakeWorker(),
        candidateTimeout: 5,
        connectRetryDelay: 1,
        createSocket: (url) => {
          attempted.push(url);
          const socket = new FakeSocket();
          if (url.includes('127.0.0.1')) socket.readyState = 1;
          return socket;
        },
      }).start();
    });

    await started;

    expect(attempted).toEqual(['ws://10.0.2.2:17878', 'ws://127.0.0.1:17878']);
  });

  it('gives up after the configured number of connection cycles', async () => {
    let attempts = 0;
    const coordinator = new NativeScriptVitestCoordinator({
      url: 'ws://10.0.0.5:17878',
      createWorker: () => new FakeWorker(),
      candidateTimeout: 5,
      connectRetryDelay: 1,
      maxConnectCycles: 2,
      createSocket: () => {
        attempts += 1;
        return new FakeSocket();
      },
    });
    const events: NativeScriptTestEvent[] = [];
    coordinator.subscribe((event) => events.push(event));

    await expect(coordinator.start()).rejects.toThrow(
      /NativeScript Vitest socket/,
    );
    expect(attempts).toBe(2);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'worker-error', worker: 0 }),
    );
  });

  it('stops retrying once the runtime is torn down', async () => {
    let attempts = 0;
    const coordinator = new NativeScriptVitestCoordinator({
      url: 'ws://10.0.0.5:17878',
      createWorker: () => new FakeWorker(),
      candidateTimeout: 5,
      connectRetryDelay: 5,
      maxConnectCycles: 100,
      createSocket: () => {
        attempts += 1;
        coordinator.stop();
        return new FakeSocket();
      },
    });

    await coordinator.start();

    expect(attempts).toBe(1);
  });

  it('multiplexes pool traffic across isolated worker slots', async () => {
    const socket = new FakeSocket();
    const workers: FakeWorker[] = [];
    const coordinator = new NativeScriptVitestCoordinator({
      createSocket: () => socket,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });

    const started = coordinator.start();
    socket.open();
    await started;
    expect(socket.wire()[0]).toMatchObject({ kind: 'hello' });

    socket.receive({
      kind: 'configure',
      protocol: 1,
      main: false,
      workers: 2,
    });
    expect(workers).toHaveLength(2);
    expect(workers[1]?.messages).toEqual([]);

    workers[1]?.emit({ kind: 'runtime-ready' });
    expect(workers[1]?.messages).toEqual([{ kind: 'start', slot: 1 }]);

    workers[1]?.emit({ kind: 'worker-ready', slot: 1 });
    expect(socket.wire().at(-1)).toEqual({ kind: 'worker-ready', slot: 1 });

    socket.receive({ kind: 'worker-message', slot: 0, frame: '["run"]' });
    expect(workers[0]?.messages.at(-1)).toEqual({
      kind: 'pool-message',
      frame: '["run"]',
    });

    coordinator.stop();
    expect(
      workers.every((worker) => worker.terminate.mock.calls.length === 1),
    ).toBe(true);
  });

  it('reserves slot 0 for the main thread and numbers workers from 1', async () => {
    const socket = new FakeSocket();
    const workers: FakeWorker[] = [];
    const coordinator = new NativeScriptVitestCoordinator({
      registry,
      createSocket: () => socket,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });

    const started = coordinator.start();
    socket.open();
    await started;

    socket.receive({ kind: 'configure', protocol: 1, main: true, workers: 2 });

    expect(workers).toHaveLength(2);
    workers[0]?.emit({ kind: 'runtime-ready' });
    workers[1]?.emit({ kind: 'runtime-ready' });
    expect(workers[0]?.messages).toEqual([{ kind: 'start', slot: 1 }]);
    expect(workers[1]?.messages).toEqual([{ kind: 'start', slot: 2 }]);

    await vi.waitFor(() =>
      expect(socket.wire()).toContainEqual({ kind: 'worker-ready', slot: 0 }),
    );

    coordinator.stop();
  });

  it('forwards test events from the main-thread slot to subscribers', async () => {
    const socket = new FakeSocket();
    const worker = new FakeWorker();
    const coordinator = new NativeScriptVitestCoordinator({
      createSocket: () => socket,
      createWorker: () => worker,
    });
    const events: NativeScriptTestEvent[] = [];
    coordinator.subscribe((event) => events.push(event));

    const started = coordinator.start();
    socket.open();
    await started;
    socket.receive({ kind: 'configure', protocol: 1, main: false, workers: 1 });

    worker.emit({
      kind: 'test-event',
      slot: 0,
      event: { type: 'worker-run-finished', worker: 0, timestamp: 5 },
    });
    worker.onerror?.({ message: 'runtime crashed' });

    expect(events).toEqual([
      { type: 'worker-run-finished', worker: 0, timestamp: 5 },
      { type: 'worker-error', worker: 0, message: 'runtime crashed' },
    ]);
  });

  it('reports a missing registry when the host asks for main-thread specs', async () => {
    const socket = new FakeSocket();
    const coordinator = new NativeScriptVitestCoordinator({
      createSocket: () => socket,
      createWorker: () => new FakeWorker(),
    });
    const events: NativeScriptTestEvent[] = [];
    coordinator.subscribe((event) => events.push(event));

    const started = coordinator.start();
    socket.open();
    await started;
    socket.receive({ kind: 'configure', protocol: 1, main: true, workers: 0 });

    expect(socket.wire().at(-1)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('`registry`'),
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'worker-error', worker: 0 }),
    );
  });

  it('reports a missing worker factory when the host asks for Worker slots', async () => {
    const socket = new FakeSocket();
    const coordinator = new NativeScriptVitestCoordinator({
      registry,
      createSocket: () => socket,
    });
    const events: NativeScriptTestEvent[] = [];
    coordinator.subscribe((event) => events.push(event));

    const started = coordinator.start();
    socket.open();
    await started;
    socket.receive({ kind: 'configure', protocol: 1, main: false, workers: 1 });

    expect(socket.wire().at(-1)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('`createWorker`'),
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'worker-error', worker: 0 }),
    );
  });

  it('surfaces a host-side error frame as a worker error', async () => {
    const socket = new FakeSocket();
    const coordinator = new NativeScriptVitestCoordinator({
      createSocket: () => socket,
      createWorker: () => new FakeWorker(),
    });
    const events: NativeScriptTestEvent[] = [];
    coordinator.subscribe((event) => events.push(event));

    const started = coordinator.start();
    socket.open();
    await started;
    socket.receive({ kind: 'error', message: 'device build failed' });

    expect(events).toEqual([
      { type: 'worker-error', worker: 0, message: 'device build failed' },
    ]);
  });
});
