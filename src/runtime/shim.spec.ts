import { describe, expect, it } from 'vitest';
import { expect as deviceExpect } from './shim.js';

describe('vitest shim', () => {
  it('exposes the static expect API', () => {
    deviceExpect({ id: 7, name: 'row' }).toEqual(
      deviceExpect.objectContaining({ id: deviceExpect.any(Number) }),
    );
    deviceExpect('native').toEqual(deviceExpect.not.stringContaining('web'));

    deviceExpect.extend({
      toBeEven(received: number) {
        return {
          pass: received % 2 === 0,
          message: () => `expected ${received} to be even`,
        };
      },
    });
    const custom = deviceExpect as unknown as Record<string, () => unknown>;
    deviceExpect([2]).toEqual([custom.toBeEven()]);
    expect(() => deviceExpect([3]).toEqual([custom.toBeEven()])).toThrow();
  });

  it('applies property operations to the device expect', () => {
    Object.defineProperty(deviceExpect, 'fixedHelper', { value: 1 });
    expect(Reflect.get(deviceExpect, 'fixedHelper')).toBe(1);
    expect(Object.keys(deviceExpect)).toContain('objectContaining');

    deviceExpect.extend({
      toBeOdd: (received: number) => ({
        pass: received % 2 === 1,
        message: () => `expected ${received} to be odd`,
      }),
    });
    expect(
      delete (deviceExpect as unknown as Record<string, unknown>).toBeOdd,
    ).toBe(true);
    expect('toBeOdd' in deviceExpect).toBe(false);

    expect(() => Object.freeze(deviceExpect)).toThrow(TypeError);
    expect(Object.keys(deviceExpect)).toContain('objectContaining');
  });
});
