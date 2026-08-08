import type {
  CancelReason,
  File,
  Task,
  TaskEventPack,
  TaskResultPack,
  VitestRunner,
  VitestRunnerConfig,
} from '@vitest/runner';
import type { WorkerGlobalState } from 'vitest';
import type {
  NativeScriptTestDescriptor,
  NativeScriptTestEvent,
  NativeScriptTestState,
} from '../protocol.js';
import type { NativeScriptTestModuleRegistry } from './registry.js';

type EventSink = (event: NativeScriptTestEvent) => void;

function initialState(task: Task): NativeScriptTestState {
  if (task.mode === 'skip') return 'skipped';
  if (task.mode === 'todo') return 'todo';
  return 'queued';
}

function resultState(state: string | undefined): NativeScriptTestState {
  switch (state) {
    case 'pass':
      return 'passed';
    case 'fail':
      return 'failed';
    case 'skip':
      return 'skipped';
    case 'todo':
      return 'todo';
    case 'run':
      return 'running';
    default:
      return 'queued';
  }
}

function errorMessage(value: unknown): string | undefined {
  if (typeof value === 'object' && value !== null && 'message' in value) {
    return String(value.message);
  }
  return value === undefined ? undefined : String(value);
}

function collectTestDescriptors(
  task: Task,
  output: NativeScriptTestDescriptor[],
): void {
  if (task.type === 'test') {
    output.push({
      id: task.id,
      name: task.name,
      fullName: task.fullName,
      file: task.file.filepath,
      state: initialState(task),
    });
    return;
  }
  task.tasks.forEach((child) => collectTestDescriptors(child, output));
}

export class NativeScriptDeviceRunner implements VitestRunner {
  cancel?: (reason: CancelReason) => void;

  constructor(
    public readonly config: VitestRunnerConfig,
    private readonly worker: number,
    private readonly registry: NativeScriptTestModuleRegistry,
    private readonly state: WorkerGlobalState,
    private readonly emit: EventSink,
    /**
     * Shared across runner instances: Vitest's throttled task updates may
     * flush after `startTests` resolves, landing while a later file's runner
     * is active — descriptors collected by one instance must stay resolvable
     * for packs processed by another, or those updates silently vanish from
     * the on-device stream.
     */
    private readonly tests: Map<string, NativeScriptTestDescriptor> = new Map(),
  ) {
    state.onCancel((reason) => this.cancel?.(reason));
  }

  importFile(filepath: string): unknown {
    return this.registry.load(filepath);
  }

  onBeforeRunFiles(files: File[]): void {
    this.emit({
      type: 'worker-run-started',
      worker: this.worker,
      files: files.map((file) => file.filepath),
      timestamp: Date.now(),
    });
  }

  onCleanupWorkerContext(cleanup: () => unknown): void {
    this.state.onCleanup(cleanup);
  }

  async onCollected(files: File[]): Promise<void> {
    const descriptors: NativeScriptTestDescriptor[] = [];
    files.forEach((file) => collectTestDescriptors(file, descriptors));
    descriptors.forEach((test) => this.tests.set(test.id, test));
    this.emit({
      type: 'tests-collected',
      worker: this.worker,
      tests: descriptors,
    });
    await this.state.rpc.onCollected(files);
  }

  async onTaskUpdate(
    packs: TaskResultPack[],
    events: TaskEventPack[],
  ): Promise<void> {
    for (const [id, result] of packs) {
      const previous = this.tests.get(id);
      if (!result) continue;
      if (!previous) {
        const error = errorMessage(result.errors?.[0]);
        if (result.state === 'fail' && error) {
          this.emit({
            type: 'worker-error',
            worker: this.worker,
            message: error,
          });
        }
        continue;
      }
      const test: NativeScriptTestDescriptor = {
        ...previous,
        state: resultState(result.state),
        duration: result.duration,
        error: errorMessage(result.errors?.[0]),
      };
      this.tests.set(id, test);
      this.emit({
        type: 'test-updated',
        worker: this.worker,
        test,
      });
    }
    await this.state.rpc.onTaskUpdate(packs, events);
  }

  finishRun(): void {
    this.emit({
      type: 'worker-run-finished',
      worker: this.worker,
      timestamp: Date.now(),
    });
  }
}
