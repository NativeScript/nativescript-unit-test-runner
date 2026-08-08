export const NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION = 1 as const;
export const DEFAULT_NATIVE_SCRIPT_VITEST_PORT = 17_878;

export type NativeScriptTestState =
  | 'queued'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'todo';

export interface NativeScriptTestDescriptor {
  id: string;
  name: string;
  fullName: string;
  file: string;
  state: NativeScriptTestState;
  duration?: number;
  error?: string;
}

export type NativeScriptTestEvent =
  | {
      type: 'worker-run-started';
      worker: number;
      files: string[];
      timestamp: number;
    }
  | {
      type: 'tests-collected';
      worker: number;
      tests: NativeScriptTestDescriptor[];
    }
  | {
      type: 'test-updated';
      worker: number;
      test: NativeScriptTestDescriptor;
    }
  | {
      type: 'worker-run-finished';
      worker: number;
      timestamp: number;
    }
  | {
      type: 'worker-error';
      worker: number;
      message: string;
    };

export type NativeScriptTestEventListener = (
  event: NativeScriptTestEvent,
) => void;

export interface NativeScriptTestEventSource {
  subscribe(listener: NativeScriptTestEventListener): () => void;
}

/**
 * Slot layout: when `main` is true, slot 0 executes on the application's main
 * thread (required for UI tests) and worker slots occupy 1..workers. When
 * `main` is false, worker slots occupy 0..workers-1.
 */
export interface NativeScriptSlotLayout {
  main: boolean;
  workers: number;
}

export function totalSlots(layout: NativeScriptSlotLayout): number {
  return (layout.main ? 1 : 0) + layout.workers;
}

export type NativeScriptVitestWireMessage =
  | {
      kind: 'hello';
      protocol: typeof NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION;
    }
  | ({
      kind: 'configure';
      protocol: typeof NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION;
    } & NativeScriptSlotLayout)
  | {
      kind: 'worker-ready';
      slot: number;
    }
  | {
      kind: 'worker-message';
      slot: number;
      frame: string;
    }
  | {
      kind: 'error';
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasSlot(value: Record<string, unknown>): boolean {
  return Number.isInteger(value.slot) && (value.slot as number) >= 0;
}

export function isNativeScriptVitestWireMessage(
  value: unknown,
): value is NativeScriptVitestWireMessage {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;

  switch (value.kind) {
    case 'hello':
      return value.protocol === NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION;
    case 'configure':
      return (
        value.protocol === NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION &&
        typeof value.main === 'boolean' &&
        Number.isInteger(value.workers) &&
        (value.workers as number) >= 0 &&
        (value.main === true || (value.workers as number) > 0)
      );
    case 'worker-ready':
      return hasSlot(value);
    case 'worker-message':
      return hasSlot(value) && typeof value.frame === 'string';
    case 'error':
      return typeof value.message === 'string';
    default:
      return false;
  }
}
