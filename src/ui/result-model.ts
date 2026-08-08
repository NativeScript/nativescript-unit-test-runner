import type {
  NativeScriptTestDescriptor,
  NativeScriptTestEvent,
} from '../protocol.js';

export type NativeScriptRunStatus = 'idle' | 'running' | 'passed' | 'failed';

export interface NativeScriptResultSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  running: number;
  queued: number;
}

export interface NativeScriptResultSnapshot {
  status: NativeScriptRunStatus;
  workers: number;
  files: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  summary: NativeScriptResultSummary;
  tests: readonly NativeScriptTestDescriptor[];
}

type SnapshotListener = (snapshot: NativeScriptResultSnapshot) => void;

function summarize(
  tests: Iterable<NativeScriptTestDescriptor>,
): NativeScriptResultSummary {
  const summary: NativeScriptResultSummary = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    running: 0,
    queued: 0,
  };

  for (const test of tests) {
    summary.total += 1;
    switch (test.state) {
      case 'passed':
        summary.passed += 1;
        break;
      case 'failed':
        summary.failed += 1;
        break;
      case 'skipped':
      case 'todo':
        summary.skipped += 1;
        break;
      case 'running':
        summary.running += 1;
        break;
      case 'queued':
        summary.queued += 1;
        break;
    }
  }
  return summary;
}

export class NativeScriptTestResultModel {
  private readonly tests = new Map<string, NativeScriptTestDescriptor>();
  private readonly files = new Set<string>();
  private readonly activeWorkers = new Set<number>();
  private readonly listeners = new Set<SnapshotListener>();
  private status: NativeScriptRunStatus = 'idle';
  private startedAt: number | undefined;
  private finishedAt: number | undefined;
  private error: string | undefined;

  apply(event: NativeScriptTestEvent): void {
    switch (event.type) {
      case 'worker-run-started':
        if (this.status === 'idle') {
          this.startedAt = event.timestamp;
        }
        this.finishedAt = undefined;
        this.status = 'running';
        this.activeWorkers.add(event.worker);
        event.files.forEach((file) => this.files.add(file));
        break;
      case 'tests-collected':
        event.tests.forEach((test) => {
          this.tests.set(test.id, { ...test });
          this.files.add(test.file);
        });
        break;
      case 'test-updated':
        this.tests.set(event.test.id, { ...event.test });
        this.files.add(event.test.file);
        break;
      case 'worker-run-finished':
        this.activeWorkers.delete(event.worker);
        if (this.activeWorkers.size === 0) {
          this.finishedAt = event.timestamp;
          this.status =
            this.error || summarize(this.tests.values()).failed
              ? 'failed'
              : 'passed';
        }
        break;
      case 'worker-error':
        this.activeWorkers.delete(event.worker);
        this.status = 'failed';
        this.error = event.message;
        this.finishedAt = Date.now();
        break;
    }
    this.notify();
  }

  reset(): void {
    this.tests.clear();
    this.files.clear();
    this.activeWorkers.clear();
    this.status = 'idle';
    this.startedAt = undefined;
    this.finishedAt = undefined;
    this.error = undefined;
    this.notify();
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): NativeScriptResultSnapshot {
    const tests = [...this.tests.values()].sort((left, right) => {
      if (left.state === 'failed' && right.state !== 'failed') return -1;
      if (right.state === 'failed' && left.state !== 'failed') return 1;
      return left.fullName.localeCompare(right.fullName);
    });
    return {
      status: this.status,
      workers: this.activeWorkers.size,
      files: this.files.size,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      error: this.error,
      summary: summarize(tests),
      tests,
    };
  }

  private notify(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
