import './web-event-polyfill.js';
import { chai as assertionLibrary } from '@vitest/expect';
import * as vitestExpectModule from '@vitest/expect';

type AssertionPlugin = (library: unknown, utils: unknown) => void;

interface AssertionRuntime {
  config: { useProxy: boolean };
  use(plugin: AssertionPlugin): void;
  expect: NativeScriptExpect & {
    extend(expect: unknown, matchers: Record<string, unknown>): void;
  };
}

interface VitestExpectRuntime {
  JestChaiExpect: AssertionPlugin;
  JestAsymmetricMatchers: AssertionPlugin;
  JestExtend: AssertionPlugin;
  GLOBAL_EXPECT: symbol;
  JEST_MATCHERS_OBJECT: symbol;
  ASYMMETRIC_MATCHERS_OBJECT: symbol;
  getState(expect: unknown): Record<string, unknown>;
  setState(state: Record<string, unknown>, expect: unknown): void;
}

export interface NativeScriptExpect {
  (actual: unknown, message?: string): unknown;
  getState(): Record<string, unknown>;
  setState(state: Record<string, unknown>): void;
  extend(matchers: Record<string, unknown>): void;
  [key: string]: unknown;
}

const assertionRuntime = assertionLibrary as unknown as AssertionRuntime;
const vitestExpect = vitestExpectModule as unknown as VitestExpectRuntime;
let currentExpect: NativeScriptExpect | undefined;

export function setupNativeScriptExpect(): NativeScriptExpect {
  if (currentExpect) return currentExpect;

  const symbolGlobals = globalThis as unknown as Record<symbol, unknown>;
  if (!symbolGlobals[vitestExpect.JEST_MATCHERS_OBJECT]) {
    symbolGlobals[vitestExpect.JEST_MATCHERS_OBJECT] = {
      matchers: {},
      state: new WeakMap<object, unknown>(),
    };
  }
  if (!symbolGlobals[vitestExpect.ASYMMETRIC_MATCHERS_OBJECT]) {
    symbolGlobals[vitestExpect.ASYMMETRIC_MATCHERS_OBJECT] = {};
  }

  assertionRuntime.config.useProxy = false;
  assertionRuntime.use(vitestExpect.JestChaiExpect);
  assertionRuntime.use(vitestExpect.JestAsymmetricMatchers);
  assertionRuntime.use(vitestExpect.JestExtend);

  const expect = ((actual: unknown, message?: string): unknown => {
    const state = vitestExpect.getState(expect);
    const assertionCalls = Number(state.assertionCalls ?? 0);
    vitestExpect.setState({ assertionCalls: assertionCalls + 1 }, expect);
    return assertionRuntime.expect(actual, message);
  }) as NativeScriptExpect;

  Object.assign(expect, assertionRuntime.expect);
  Object.assign(
    expect,
    symbolGlobals[vitestExpect.ASYMMETRIC_MATCHERS_OBJECT] as object,
  );
  expect.getState = () => vitestExpect.getState(expect);
  expect.setState = (state) => vitestExpect.setState(state, expect);
  expect.extend = (matchers) =>
    assertionRuntime.expect.extend(expect, matchers);
  vitestExpect.setState(
    {
      assertionCalls: 0,
      isExpectingAssertions: false,
      isExpectingAssertionsError: null,
      expectedAssertionsNumber: null,
      expectedAssertionsNumberErrorGen: null,
    },
    expect,
  );

  symbolGlobals[vitestExpect.GLOBAL_EXPECT] = expect;
  (globalThis as unknown as { expect?: NativeScriptExpect }).expect = expect;
  currentExpect = expect;
  return expect;
}

export function getNativeScriptExpect(): NativeScriptExpect {
  return currentExpect ?? setupNativeScriptExpect();
}
