import { describe, expect, it, vi } from 'vitest';
import {
  createNativeScriptTestRegistry,
  createWebpackTestRegistry,
  type WebpackRequireContext,
} from './registry.js';

describe('NativeScript test registry', () => {
  it('matches host absolute paths to webpack context keys', () => {
    const run = vi.fn();
    const context = Object.assign(
      (key: string) => ({
        __run: key === './math.spec.ts' ? run : vi.fn(),
      }),
      { keys: () => ['./math.spec.ts'] },
    ) as WebpackRequireContext;
    const registry = createWebpackTestRegistry(context);

    registry.load('/workspace/app/math.spec.ts');

    expect(run).toHaveBeenCalledOnce();
  });

  it('refuses an ambiguous webpack match', () => {
    const context = Object.assign(() => ({}), {
      keys: () => ['./app/math.spec.ts', './math.spec.ts'],
    }) as WebpackRequireContext;

    expect(() =>
      createWebpackTestRegistry(context).load('/workspace/app/math.spec.ts'),
    ).toThrow('matched more than one bundled module');
  });

  it('reports tests that were not bundled', () => {
    const context = Object.assign(() => ({}), {
      keys: () => ['./other.spec.ts'],
    }) as WebpackRequireContext;

    expect(() =>
      createWebpackTestRegistry(context).load('/app/missing.spec.ts'),
    ).toThrow('was not bundled');
  });

  it('normalizes Windows separators against registered modules', () => {
    const load = vi.fn(() => ({}));
    const registry = createNativeScriptTestRegistry({
      'app/known.spec.ts': load,
    });

    registry.load('C:\\workspace\\app\\known.spec.ts');

    expect(load).toHaveBeenCalledOnce();
  });

  it('reports tests that were not registered', () => {
    const registry = createNativeScriptTestRegistry({
      'known.spec.ts': () => ({}),
    });
    expect(() => registry.load('/app/missing.spec.ts')).toThrow(
      'was not registered',
    );
  });
});
