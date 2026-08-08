import { parse as flatParse, stringify as flatStringify } from 'flatted';
import { describe, expect, it } from 'vitest';
import type { WorkerRequest } from 'vitest/node';
import type { NativeScriptTestModuleRegistry } from './registry.js';
import {
  registerNativeScriptVitestWorker,
  type NativeScriptWorkerScope,
} from './worker.js';

class FakeWorkerScope implements NativeScriptWorkerScope {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  readonly posted: unknown[] = [];
  closed = 0;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  close(): void {
    this.closed += 1;
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: message });
  }

  poolFrames(): unknown[] {
    return this.posted
      .filter(
        (message): message is { kind: string; frame: string } =>
          typeof message === 'object' &&
          message !== null &&
          (message as { kind?: unknown }).kind === 'pool-message',
      )
      .map((message) => flatParse(message.frame));
  }
}

const registry: NativeScriptTestModuleRegistry = {
  load: () => undefined,
};

function startRequest(): WorkerRequest {
  return {
    __vitest_worker_request__: true,
    type: 'start',
    poolId: 1,
    workerId: 4,
    options: { reportMemory: false },
    context: {
      environment: { name: 'node', options: null },
      config: { name: 'native-unit-tests' },
      pool: 'nativescript',
    },
    traces: { enabled: false },
  } as WorkerRequest;
}

function runRequest(): WorkerRequest {
  return {
    __vitest_worker_request__: true,
    type: 'run',
    context: { workerId: 4, files: [], providedContext: {} },
  } as unknown as WorkerRequest;
}

describe('registerNativeScriptVitestWorker', () => {
  it('boots a slot and speaks the Vitest worker response protocol', async () => {
    const scope = new FakeWorkerScope();
    registerNativeScriptVitestWorker({ registry, scope });
    expect(scope.posted).toContainEqual({ kind: 'runtime-ready' });

    scope.receive({ kind: 'start', slot: 2 });
    expect(scope.posted).toContainEqual({ kind: 'worker-ready', slot: 2 });

    scope.receive({
      kind: 'pool-message',
      frame: flatStringify(startRequest()),
    });
    await Promise.resolve();

    expect(scope.poolFrames()).toContainEqual({
      __vitest_worker_response__: true,
      type: 'started',
    });
  });

  it('refuses to run files before the pool has started the slot', async () => {
    const scope = new FakeWorkerScope();
    registerNativeScriptVitestWorker({ registry, scope });
    scope.receive({ kind: 'start', slot: 0 });

    scope.receive({ kind: 'pool-message', frame: flatStringify(runRequest()) });
    await Promise.resolve();

    expect(scope.poolFrames()).toContainEqual(
      expect.objectContaining({
        __vitest_worker_response__: true,
        type: 'testfileFinished',
        error: expect.objectContaining({
          message: 'NativeScript Vitest worker was not started',
        }),
      }),
    );
  });

  it('ignores pool traffic until the coordinator assigns a slot', () => {
    const scope = new FakeWorkerScope();
    registerNativeScriptVitestWorker({ registry, scope });

    scope.receive({ kind: 'pool-message', frame: flatStringify(runRequest()) });

    expect(scope.poolFrames()).toEqual([]);

    // Stops the readiness poll the runtime keeps until a slot is assigned.
    scope.receive({ kind: 'start', slot: 0 });
  });

  it('closes the runtime when the coordinator stops the slot', () => {
    const scope = new FakeWorkerScope();
    registerNativeScriptVitestWorker({ registry, scope });
    scope.receive({ kind: 'start', slot: 1 });

    scope.receive({ kind: 'stop' });

    expect(scope.closed).toBe(1);
  });
});
