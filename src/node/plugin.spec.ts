import { describe, expect, it } from 'vitest';
import { defaultInclude } from 'vitest/config';
import type { VitestPluginContext } from 'vitest/node';
import { nativeScript } from './plugin.js';

function configureWith(
  plugin: ReturnType<typeof nativeScript>,
  config: Record<string, unknown>,
): Record<string, unknown> {
  plugin.configureVitest({
    project: { config },
  } as unknown as VitestPluginContext);
  return config;
}

describe('nativeScript', () => {
  it('configures reusable pool workers for the fixed device slots', () => {
    const config = configureWith(
      nativeScript({ platform: 'ios', launch: false, workers: 2 }),
      { include: [...defaultInclude] },
    );

    expect(config).toMatchObject({
      pool: 'nativescript',
      maxWorkers: 3,
      isolate: false,
      include: [
        'app/**/*.spec.ts',
        'app/**/*.spec.js',
        'src/**/*.spec.ts',
        'src/**/*.spec.js',
      ],
    });
    expect(config.poolRunner).toMatchObject({ name: 'nativescript' });
  });

  it('reserves a single slot for the default main-thread-only layout', () => {
    const config = configureWith(
      nativeScript({ platform: 'android', launch: false }),
      {},
    );

    expect(config.maxWorkers).toBe(1);
  });

  it('preserves an explicit Vitest include unless the plugin overrides it', () => {
    expect(
      configureWith(nativeScript({ platform: 'android', launch: false }), {
        include: ['app/unit/**/*.test.ts'],
      }).include,
    ).toEqual(['app/unit/**/*.test.ts']);

    expect(
      configureWith(
        nativeScript({
          platform: 'android',
          launch: false,
          include: ['tests/**/*.spec.ts'],
        }),
        { include: ['app/unit/**/*.test.ts'] },
      ).include,
    ).toEqual(['tests/**/*.spec.ts']);
  });

  it('creates a distinct pool worker per Vitest request', () => {
    const config = configureWith(
      nativeScript({ platform: 'ios', launch: false, workers: 1 }),
      {},
    );
    const { createPoolWorker } = config.poolRunner as {
      createPoolWorker: () => { name: string };
    };

    const workers = [createPoolWorker(), createPoolWorker(), createPoolWorker()];

    expect(workers.map((worker) => worker.name)).toEqual([
      'nativescript',
      'nativescript',
      'nativescript',
    ]);
    expect(new Set(workers).size).toBe(3);
  });

  it('names itself after the published package', () => {
    expect(nativeScript({ platform: 'ios', launch: false }).name).toBe(
      'nativescript-unit-test-runner',
    );
  });
});
