import { parse as flatParse, stringify as flatStringify } from 'flatted';
import { describe, expect, it, vi } from 'vitest';
import type { WorkerRequest } from 'vitest/node';
import { createMainThreadWorkerHandle } from './loopback.js';
import type { NativeScriptTestModuleRegistry } from './registry.js';

const registry: NativeScriptTestModuleRegistry = { load: () => undefined };

function collect(): {
  handle: ReturnType<typeof createMainThreadWorkerHandle>;
  received: unknown[];
} {
  const received: unknown[] = [];
  const handle = createMainThreadWorkerHandle(registry);
  handle.onmessage = (event) => {
    received.push(event.data);
  };
  return { handle, received };
}

describe('createMainThreadWorkerHandle', () => {
  it('completes the slot handshake on the current thread', async () => {
    const { handle, received } = collect();

    await vi.waitFor(() =>
      expect(received).toContainEqual({ kind: 'runtime-ready' }),
    );

    handle.postMessage({ kind: 'start', slot: 2 });
    expect(received).not.toContainEqual({ kind: 'worker-ready', slot: 2 });

    await vi.waitFor(() =>
      expect(received).toContainEqual({ kind: 'worker-ready', slot: 2 }),
    );

    expect(() => handle.terminate()).not.toThrow();
  });

  it('carries Vitest pool traffic in both directions', async () => {
    const { handle, received } = collect();
    handle.postMessage({ kind: 'start', slot: 0 });
    await vi.waitFor(() =>
      expect(received).toContainEqual({ kind: 'worker-ready', slot: 0 }),
    );

    handle.postMessage({
      kind: 'pool-message',
      frame: flatStringify({
        __vitest_worker_request__: true,
        type: 'start',
        poolId: 1,
        workerId: 1,
        options: { reportMemory: false },
        context: {
          environment: { name: 'node', options: null },
          config: { name: 'native-unit-tests' },
          pool: 'nativescript',
        },
        traces: { enabled: false },
      } as WorkerRequest),
    });

    await vi.waitFor(() => {
      const frames = received
        .filter(
          (message): message is { kind: string; frame: string } =>
            typeof message === 'object' &&
            message !== null &&
            (message as { kind?: unknown }).kind === 'pool-message',
        )
        .map((message) => flatParse(message.frame));
      expect(frames).toContainEqual({
        __vitest_worker_response__: true,
        type: 'started',
      });
    });
  });

});
