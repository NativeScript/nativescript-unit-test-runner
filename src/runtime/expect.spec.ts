import { describe, expect, it } from 'vitest';
import {
  getNativeScriptExpect,
  setupNativeScriptExpect,
  type NativeScriptExpect,
} from './expect.js';

interface DeviceAssertion {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
}

interface DeviceExpect extends NativeScriptExpect {
  (actual: unknown, message?: string): DeviceAssertion;
  objectContaining(sample: Record<string, unknown>): unknown;
}

describe('setupNativeScriptExpect', () => {
  it('installs core and asymmetric Vitest matchers without the Node worker', () => {
    const deviceExpect = setupNativeScriptExpect() as DeviceExpect;

    deviceExpect(2).toBe(2);
    deviceExpect({ runtime: 'native', value: 3 }).toEqual(
      deviceExpect.objectContaining({ runtime: 'native' }),
    );
    expect(() => deviceExpect(2).toBe(3)).toThrow();
    expect(getNativeScriptExpect()).toBe(deviceExpect);
    expect(setupNativeScriptExpect()).toBe(deviceExpect);
  });

  it('counts assertions so expect.assertions can be honoured on device', () => {
    const deviceExpect = setupNativeScriptExpect() as DeviceExpect;
    deviceExpect.setState({ assertionCalls: 0 });

    deviceExpect(1).toBe(1);
    deviceExpect(2).toBe(2);

    expect(deviceExpect.getState().assertionCalls).toBe(2);
  });
});
