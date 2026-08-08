import type { NativeScriptWorkerHandle } from './coordinator.js';
import type { NativeScriptTestModuleRegistry } from './registry.js';
import {
  registerNativeScriptVitestWorker,
  type NativeScriptWorkerScope,
} from './worker.js';

/**
 * Runs the Vitest worker runtime on the current (main) thread by bridging the
 * coordinator and the runtime through a microtask-queued message pair instead
 * of a NativeScript `Worker`. This is what allows specs to touch Views,
 * Frames, and every other UI API. The microtask hop keeps delivery
 * asynchronous like real postMessage, avoiding re-entrant dispatch.
 */
export function createMainThreadWorkerHandle(
  registry: NativeScriptTestModuleRegistry,
): NativeScriptWorkerHandle {
  const handle: NativeScriptWorkerHandle = {
    onmessage: null,
    onerror: null,
    postMessage: (message) => {
      queueMicrotask(() => scope.onmessage?.({ data: message }));
    },
    terminate: () => undefined,
  };

  const scope: NativeScriptWorkerScope = {
    onmessage: null,
    postMessage: (message) => {
      queueMicrotask(() => handle.onmessage?.({ data: message }));
    },
    close: () => undefined,
  };

  registerNativeScriptVitestWorker({ registry, scope });
  return handle;
}
