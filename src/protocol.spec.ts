import { describe, expect, it } from 'vitest';
import {
  NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION,
  isNativeScriptVitestWireMessage,
  totalSlots,
} from './protocol.js';

describe('totalSlots', () => {
  it('counts the main-thread slot alongside the worker slots', () => {
    expect(totalSlots({ main: true, workers: 0 })).toBe(1);
    expect(totalSlots({ main: true, workers: 2 })).toBe(3);
    expect(totalSlots({ main: false, workers: 2 })).toBe(2);
  });
});

describe('NativeScript Vitest protocol', () => {
  it('accepts versioned configuration and worker messages', () => {
    expect(
      isNativeScriptVitestWireMessage({
        kind: 'configure',
        protocol: NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION,
        main: true,
        workers: 2,
      }),
    ).toBe(true);
    expect(
      isNativeScriptVitestWireMessage({
        kind: 'worker-message',
        slot: 1,
        frame: '["payload"]',
      }),
    ).toBe(true);
  });

  it('accepts a layout with no worker slots when the main thread runs specs', () => {
    expect(
      isNativeScriptVitestWireMessage({
        kind: 'configure',
        protocol: NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION,
        main: true,
        workers: 0,
      }),
    ).toBe(true);
  });

  it('rejects a layout with no execution context at all', () => {
    expect(
      isNativeScriptVitestWireMessage({
        kind: 'configure',
        protocol: NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION,
        main: false,
        workers: 0,
      }),
    ).toBe(false);
  });

  it('rejects configuration without a slot layout', () => {
    expect(
      isNativeScriptVitestWireMessage({
        kind: 'configure',
        protocol: NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION,
        workers: 2,
      }),
    ).toBe(false);
    expect(
      isNativeScriptVitestWireMessage({
        kind: 'configure',
        protocol: NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION,
        main: false,
        workers: 1.5,
      }),
    ).toBe(false);
    expect(
      isNativeScriptVitestWireMessage({
        kind: 'configure',
        protocol: NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION,
        main: false,
        workers: -1,
      }),
    ).toBe(false);
  });

  it('rejects incompatible versions and invalid slots', () => {
    expect(
      isNativeScriptVitestWireMessage({ kind: 'hello', protocol: 2 }),
    ).toBe(false);
    expect(
      isNativeScriptVitestWireMessage({
        kind: 'worker-ready',
        slot: -1,
      }),
    ).toBe(false);
    expect(isNativeScriptVitestWireMessage({ kind: 'unknown' })).toBe(false);
    expect(isNativeScriptVitestWireMessage(null)).toBe(false);
  });
});
