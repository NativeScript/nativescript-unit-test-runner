import { describe, expect, it, vi } from 'vitest';
import type { NativeScriptResultSnapshot } from './result-model.js';
import { NativeScriptTestResultModel } from './result-model.js';

describe('NativeScriptTestResultModel', () => {
  it('aggregates parallel worker results into one failed run', () => {
    const model = new NativeScriptTestResultModel();
    model.apply({
      type: 'worker-run-started',
      worker: 0,
      files: ['/app/a.spec.ts'],
      timestamp: 10,
    });
    model.apply({
      type: 'worker-run-started',
      worker: 1,
      files: ['/app/b.spec.ts'],
      timestamp: 11,
    });
    model.apply({
      type: 'tests-collected',
      worker: 0,
      tests: [
        {
          id: 'a',
          name: 'passes',
          fullName: 'a > passes',
          file: '/app/a.spec.ts',
          state: 'queued',
        },
      ],
    });
    model.apply({
      type: 'tests-collected',
      worker: 1,
      tests: [
        {
          id: 'b',
          name: 'fails',
          fullName: 'b > fails',
          file: '/app/b.spec.ts',
          state: 'queued',
        },
      ],
    });
    model.apply({
      type: 'test-updated',
      worker: 0,
      test: {
        id: 'a',
        name: 'passes',
        fullName: 'a > passes',
        file: '/app/a.spec.ts',
        state: 'passed',
        duration: 2,
      },
    });
    model.apply({
      type: 'test-updated',
      worker: 1,
      test: {
        id: 'b',
        name: 'fails',
        fullName: 'b > fails',
        file: '/app/b.spec.ts',
        state: 'failed',
        error: 'expected true to be false',
      },
    });
    model.apply({ type: 'worker-run-finished', worker: 0, timestamp: 20 });
    model.apply({ type: 'worker-run-finished', worker: 1, timestamp: 21 });

    const snapshot = model.snapshot();
    expect(snapshot.status).toBe('failed');
    expect(snapshot.files).toBe(2);
    expect(snapshot.startedAt).toBe(10);
    expect(snapshot.finishedAt).toBe(21);
    expect(snapshot.summary).toMatchObject({
      total: 2,
      passed: 1,
      failed: 1,
    });
    expect(snapshot.tests[0]?.id).toBe('b');
  });

  it('retains results when a later parallel slot starts after an early slot finishes', () => {
    const model = new NativeScriptTestResultModel();
    model.apply({
      type: 'worker-run-started',
      worker: 0,
      files: ['/app/fast.spec.ts'],
      timestamp: 10,
    });
    model.apply({
      type: 'tests-collected',
      worker: 0,
      tests: [
        {
          id: 'fast',
          name: 'fast',
          fullName: 'fast',
          file: '/app/fast.spec.ts',
          state: 'passed',
        },
      ],
    });
    model.apply({ type: 'worker-run-finished', worker: 0, timestamp: 11 });

    model.apply({
      type: 'worker-run-started',
      worker: 1,
      files: ['/app/slow.spec.ts'],
      timestamp: 12,
    });
    model.apply({
      type: 'tests-collected',
      worker: 1,
      tests: [
        {
          id: 'slow',
          name: 'slow',
          fullName: 'slow',
          file: '/app/slow.spec.ts',
          state: 'passed',
        },
      ],
    });
    model.apply({ type: 'worker-run-finished', worker: 1, timestamp: 13 });

    expect(model.snapshot()).toMatchObject({
      status: 'passed',
      files: 2,
      summary: { total: 2, passed: 2 },
    });
  });

  it('counts todo alongside skipped and tracks in-flight tests', () => {
    const model = new NativeScriptTestResultModel();
    model.apply({
      type: 'tests-collected',
      worker: 0,
      tests: [
        {
          id: 'skip',
          name: 'skip',
          fullName: 'skip',
          file: '/app/a.spec.ts',
          state: 'skipped',
        },
        {
          id: 'todo',
          name: 'todo',
          fullName: 'todo',
          file: '/app/a.spec.ts',
          state: 'todo',
        },
        {
          id: 'run',
          name: 'run',
          fullName: 'run',
          file: '/app/a.spec.ts',
          state: 'running',
        },
        {
          id: 'wait',
          name: 'wait',
          fullName: 'wait',
          file: '/app/a.spec.ts',
          state: 'queued',
        },
      ],
    });

    expect(model.snapshot().summary).toEqual({
      total: 4,
      passed: 0,
      failed: 0,
      skipped: 2,
      running: 1,
      queued: 1,
    });
  });

  it('fails the run on a worker error and clears the active worker', () => {
    const model = new NativeScriptTestResultModel();
    model.apply({
      type: 'worker-run-started',
      worker: 1,
      files: ['/app/a.spec.ts'],
      timestamp: 10,
    });

    model.apply({
      type: 'worker-error',
      worker: 1,
      message: 'device disconnected',
    });

    expect(model.snapshot()).toMatchObject({
      status: 'failed',
      workers: 0,
      error: 'device disconnected',
    });
  });

  it('publishes the current snapshot on subscribe and on every event', () => {
    const model = new NativeScriptTestResultModel();
    const snapshots: NativeScriptResultSnapshot[] = [];
    const listener = vi.fn((snapshot: NativeScriptResultSnapshot) => {
      snapshots.push(snapshot);
    });

    const unsubscribe = model.subscribe(listener);
    expect(snapshots.at(-1)?.status).toBe('idle');

    model.apply({
      type: 'worker-run-started',
      worker: 0,
      files: ['/app/a.spec.ts'],
      timestamp: 1,
    });
    expect(snapshots.at(-1)?.status).toBe('running');

    unsubscribe();
    model.apply({ type: 'worker-run-finished', worker: 0, timestamp: 2 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns to an idle run after a reset', () => {
    const model = new NativeScriptTestResultModel();
    model.apply({
      type: 'worker-error',
      worker: 0,
      message: 'device disconnected',
    });

    model.reset();

    expect(model.snapshot()).toMatchObject({
      status: 'idle',
      files: 0,
      error: undefined,
      summary: { total: 0 },
    });
  });
});
