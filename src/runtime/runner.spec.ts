import { startTests, type VitestRunnerConfig } from '@vitest/runner';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { WorkerGlobalState } from 'vitest';
import type {
  NativeScriptTestDescriptor,
  NativeScriptTestEvent,
} from '../protocol.js';
import { getNativeScriptExpect, type NativeScriptExpect } from './expect.js';
import { createNativeScriptTestRegistry } from './registry.js';
import { NativeScriptDeviceRunner } from './runner.js';
import { aroundEach as deviceAroundEach, test as deviceTest } from './shim.js';

const config: VitestRunnerConfig = {
  root: '/app',
  setupFiles: [],
  name: 'native-unit-tests',
  passWithNoTests: false,
  testNamePattern: undefined,
  allowOnly: true,
  sequence: {
    seed: 1,
    hooks: 'list',
    setupFiles: 'list',
  },
  chaiConfig: undefined,
  maxConcurrency: 1,
  testTimeout: 1_000,
  hookTimeout: 1_000,
  retry: 0,
  includeTaskLocation: false,
  tags: [],
  tagsFilter: undefined,
  strictTags: false,
};

interface DeviceAssertion {
  toBe(expected: unknown): void;
  resolves: { toBe(expected: unknown): Promise<void> };
}

interface DeviceExpect extends NativeScriptExpect {
  (actual: unknown): DeviceAssertion;
  soft(actual: unknown): DeviceAssertion;
}
type DeviceResults = Map<string, NativeScriptTestDescriptor>;

const onCollected = vi.fn(async () => undefined);
const onTaskUpdate = vi.fn(async () => undefined);
const events: NativeScriptTestEvent[] = [];
let counted: DeviceResults;
let required: DeviceResults;
let concurrent: DeviceResults;
let wrapped: DeviceResults;
let bound: DeviceResults;
let softReached = false;

async function runDeviceTests(
  options: { requireAssertions?: boolean; maxConcurrency?: number },
  defineTests: () => void,
): Promise<DeviceResults> {
  const runnerConfig = {
    ...config,
    maxConcurrency: options.maxConcurrency ?? 1,
  };
  const results: DeviceResults = new Map();
  const state = {
    config: {
      ...runnerConfig,
      expect: { requireAssertions: options.requireAssertions ?? false },
    },
    rpc: {
      onCollected: async () => undefined,
      onTaskUpdate: async () => undefined,
    },
    onCancel: () => undefined,
    onCleanup: () => undefined,
  } as unknown as WorkerGlobalState;
  const runner = new NativeScriptDeviceRunner(
    runnerConfig,
    0,
    createNativeScriptTestRegistry({ 'assertions.spec.ts': defineTests }),
    state,
    (event) => {
      if (event.type === 'test-updated') {
        results.set(event.test.name, event.test);
      }
    },
  );
  await startTests([{ filepath: '/app/assertions.spec.ts' }], runner);
  return results;
}

// A device run shares Vitest's task update queue with this file's own run, so
// every device run finishes before this file reports its first test result.
beforeAll(async () => {
  const state = {
    config,
    rpc: { onCollected, onTaskUpdate },
    onCancel: () => undefined,
    onCleanup: () => undefined,
  } as unknown as WorkerGlobalState;
  const registry = createNativeScriptTestRegistry({
    'basic.spec.ts': () => {
      deviceTest('runs on the device runner', () => {
        if (1 + 1 !== 2) throw new Error('arithmetic failed');
      });
      deviceTest('reports a device assertion failure', () => {
        throw new Error('expected device failure');
      });
      deviceTest.skip('is skipped on the device', () => undefined);
    },
  });
  const runner = new NativeScriptDeviceRunner(
    config,
    3,
    registry,
    state,
    (event) => events.push(event),
  );
  await startTests([{ filepath: '/app/basic.spec.ts' }], runner);
  runner.finishRun();

  const deviceExpect = getNativeScriptExpect() as DeviceExpect;
  counted = await runDeviceTests({}, () => {
    deviceTest('meets its assertion count', () => {
      deviceExpect.assertions(1);
      deviceExpect(1).toBe(1);
    });
    deviceTest('starts counting from zero', () => {
      deviceExpect.assertions(1);
      deviceExpect(2).toBe(2);
    });
    deviceTest('misses its assertion count', () => {
      deviceExpect.assertions(2);
      deviceExpect(3).toBe(3);
    });
    deviceTest('expects an assertion but makes none', () => {
      deviceExpect.hasAssertions();
    });
    deviceTest('makes no assertion', () => undefined);
  });
  required = await runDeviceTests({ requireAssertions: true }, () => {
    deviceTest('makes no assertion', () => undefined);
  });
  concurrent = await runDeviceTests({ maxConcurrency: 2 }, () => {
    for (const name of ['counts its own assertions', 'counts its own too']) {
      deviceTest.concurrent(name, async ({ expect: testExpect }) => {
        testExpect.assertions(1);
        await Promise.resolve();
        testExpect(name).toBe(name);
      });
    }
  });
  wrapped = await runDeviceTests({}, () => {
    deviceAroundEach(async (run, { expect: testExpect }) => {
      testExpect.hasAssertions();
      await run();
    });
    deviceTest('makes no assertion inside aroundEach', () => undefined);
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  bound = await runDeviceTests({}, () => {
    deviceTest(
      'leaves a context assertion unawaited',
      ({ expect: testExpect }) => {
        void testExpect(Promise.resolve(2)).resolves.toBe(1);
      },
    );
    deviceTest('leaves a global assertion unawaited', () => {
      void deviceExpect(Promise.resolve(2)).resolves.toBe(1);
    });
    deviceTest('fails a soft assertion', () => {
      deviceExpect.soft(1).toBe(2);
      softReached = true;
    });
  });
  warn.mockRestore();
});

describe('NativeScriptDeviceRunner', () => {
  it('collects and executes a registered unit test through Vitest', () => {
    expect(onCollected).toHaveBeenCalledOnce();
    expect(onTaskUpdate).toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'worker-run-started', worker: 3 }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'test-updated',
        worker: 3,
        test: expect.objectContaining({ state: 'passed' }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'test-updated',
        worker: 3,
        test: expect.objectContaining({
          state: 'failed',
          error: 'expected device failure',
        }),
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: 'worker-run-finished',
      worker: 3,
    });
  });

  it('reports the collected slot layout to the optional device UI', () => {
    const collected = events.find(
      (
        event,
      ): event is Extract<NativeScriptTestEvent, { type: 'tests-collected' }> =>
        event.type === 'tests-collected',
    );

    expect(collected?.tests.map((test) => test.state)).toEqual([
      'queued',
      'queued',
      'skipped',
    ]);
    expect(
      collected?.tests.every((test) => test.file === '/app/basic.spec.ts'),
    ).toBe(true);
  });
});

describe('NativeScriptDeviceRunner assertion checks', () => {
  it('checks expect.assertions and expect.hasAssertions per test', () => {
    expect(counted.get('meets its assertion count')?.state).toBe('passed');
    expect(counted.get('starts counting from zero')?.state).toBe('passed');
    expect(counted.get('misses its assertion count')).toMatchObject({
      state: 'failed',
      error: 'expected number of assertions to be 2, but got 1',
    });
    expect(counted.get('expects an assertion but makes none')).toMatchObject({
      state: 'failed',
      error: 'expected any number of assertion, but got none',
    });
    expect(counted.get('makes no assertion')?.state).toBe('passed');
  });

  it('checks a concurrent test on its context expect', () => {
    expect(concurrent.get('counts its own assertions')?.state).toBe('passed');
    expect(concurrent.get('counts its own too')?.state).toBe('passed');
  });

  it('keeps what aroundEach sets up on the context expect', () => {
    expect(wrapped.get('makes no assertion inside aroundEach')).toMatchObject({
      state: 'failed',
      error: 'expected any number of assertion, but got none',
    });
  });

  it('awaits unawaited assertions and records soft failures', () => {
    expect(bound.get('leaves a context assertion unawaited')).toMatchObject({
      state: 'failed',
      error: 'expected 2 to be 1 // Object.is equality',
    });
    expect(bound.get('leaves a global assertion unawaited')).toMatchObject({
      state: 'failed',
      error: 'expected 2 to be 1 // Object.is equality',
    });
    expect(bound.get('fails a soft assertion')).toMatchObject({
      state: 'failed',
      error: 'expected 1 to be 2 // Object.is equality',
    });
    expect(softReached).toBe(true);
  });

  it('fails a test without assertions when requireAssertions is set', () => {
    expect(required.get('makes no assertion')).toMatchObject({
      state: 'failed',
      error: 'expected any number of assertion, but got none',
    });
  });
});
