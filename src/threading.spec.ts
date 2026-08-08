import { describe, expect, it } from 'vitest';
import { resolveNativeScriptWorkerCount } from './threading.js';

describe('resolveNativeScriptWorkerCount', () => {
  it('defaults to no extra worker runtimes', () => {
    expect(resolveNativeScriptWorkerCount(undefined, 12)).toBe(0);
  });

  it('accepts an explicit zero', () => {
    expect(resolveNativeScriptWorkerCount(0, 12)).toBe(0);
  });

  it('reserves a runtime thread and caps automatic parallelism', () => {
    expect(resolveNativeScriptWorkerCount('auto', 1)).toBe(1);
    expect(resolveNativeScriptWorkerCount('auto', 3)).toBe(2);
    expect(resolveNativeScriptWorkerCount('auto', 12)).toBe(4);
  });

  it('falls back to a single worker when parallelism is unknown', () => {
    expect(resolveNativeScriptWorkerCount('auto', Number.NaN)).toBe(1);
  });

  it('rejects negative and fractional counts', () => {
    expect(() => resolveNativeScriptWorkerCount(-1, 4)).toThrow(RangeError);
    expect(() => resolveNativeScriptWorkerCount(1.5, 4)).toThrow(RangeError);
  });
});
