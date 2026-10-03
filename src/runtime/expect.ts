import './web-event-polyfill.js';
import { chai as assertionLibrary } from '@vitest/expect';
import * as vitestExpectModule from '@vitest/expect';
import { getCurrentTest, type Test } from '@vitest/runner';

type AssertionPlugin = (library: unknown, utils: unknown) => void;

interface Assertion {
  withTest(test: Test): Assertion;
  withContext(context: Record<string, unknown>): Assertion;
}

interface AssertionRuntime {
  config: { useProxy: boolean };
  use(plugin: AssertionPlugin): void;
  assert: { fail(message: string): never };
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
  customMatchers: Record<string, unknown>;
  getState(expect: unknown): Record<string, unknown>;
  setState(state: Record<string, unknown>, expect: unknown): void;
  addCustomEqualityTesters(testers: unknown[]): void;
}

type AssertionState = {
  assertionCalls: number;
  isExpectingAssertions: boolean;
  isExpectingAssertionsError: Error | null;
  expectedAssertionsNumber: number | null;
  expectedAssertionsNumberErrorGen: (() => Error) | null;
};

export interface NativeScriptExpect {
  (actual: unknown, message?: string): unknown;
  getState(): Record<string, unknown>;
  setState(state: Record<string, unknown>): void;
  extend(matchers: Record<string, unknown>): void;
  soft(actual: unknown, message?: string): unknown;
  assertions(expected: number): void;
  hasAssertions(): void;
  unreachable(message?: string): never;
  addEqualityTesters(testers: unknown[]): void;
  [key: string]: unknown;
}

const assertionRuntime = assertionLibrary as unknown as AssertionRuntime;
const vitestExpect = vitestExpectModule as unknown as VitestExpectRuntime;
let currentExpect: NativeScriptExpect | undefined;

function initialAssertionState(): AssertionState {
  return {
    assertionCalls: 0,
    isExpectingAssertions: false,
    isExpectingAssertionsError: null,
    expectedAssertionsNumber: null,
    expectedAssertionsNumberErrorGen: null,
  };
}

function prepareAssertionLibrary(): void {
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
}

/**
 * Creates an `expect` with its own assertion state, like the one Vitest puts
 * on a test's context. Its assertions belong to `test`, or to the test running
 * when they are made, which lets the runner await or record their failures.
 * Matchers and `expect.extend` stay shared.
 */
export function createNativeScriptExpect(test?: Test): NativeScriptExpect {
  prepareAssertionLibrary();

  const expect = ((actual: unknown, message?: string): unknown => {
    const state = vitestExpect.getState(expect);
    const assertionCalls = Number(state.assertionCalls ?? 0);
    vitestExpect.setState({ assertionCalls: assertionCalls + 1 }, expect);
    const assertion = assertionRuntime.expect(actual, message) as Assertion;
    const owner = test ?? getCurrentTest();
    return owner ? assertion.withTest(owner) : assertion;
  }) as NativeScriptExpect;

  Object.assign(expect, assertionRuntime.expect);
  Object.assign(
    expect,
    (globalThis as unknown as Record<symbol, object>)[
      vitestExpect.ASYMMETRIC_MATCHERS_OBJECT
    ],
  );
  expect.getState = () => vitestExpect.getState(expect);
  expect.setState = (state) => vitestExpect.setState(state, expect);
  expect.extend = (matchers) =>
    assertionRuntime.expect.extend(expect, matchers);
  expect.soft = (actual, message) =>
    (expect(actual, message) as Assertion).withContext({ soft: true });
  expect.assert = assertionRuntime.assert;
  expect.addEqualityTesters = (testers) =>
    vitestExpect.addCustomEqualityTesters(testers);
  expect.unreachable = (message) =>
    assertionRuntime.assert.fail(
      `expected${message ? ` "${message}" ` : ' '}not to be reached`,
    );
  expect.assertions = (expected) => {
    expect.setState({
      expectedAssertionsNumber: expected,
      expectedAssertionsNumberErrorGen: () =>
        new Error(
          `expected number of assertions to be ${expected}, but got ${String(
            expect.getState().assertionCalls,
          )}`,
        ),
    });
  };
  expect.hasAssertions = () => {
    expect.setState({
      isExpectingAssertions: true,
      isExpectingAssertionsError: new Error(
        'expected any number of assertion, but got none',
      ),
    });
  };
  expect.extend(vitestExpect.customMatchers);
  vitestExpect.setState(initialAssertionState(), expect);
  return expect;
}

export function setupNativeScriptExpect(): NativeScriptExpect {
  if (currentExpect) return currentExpect;

  const expect = createNativeScriptExpect();
  (globalThis as unknown as Record<symbol, unknown>)[
    vitestExpect.GLOBAL_EXPECT
  ] = expect;
  (globalThis as unknown as { expect?: NativeScriptExpect }).expect = expect;
  currentExpect = expect;
  return expect;
}

export function getNativeScriptExpect(): NativeScriptExpect {
  return currentExpect ?? setupNativeScriptExpect();
}

/** Resets the assertion state that `verifyNativeScriptAssertions` checks. */
export function resetNativeScriptAssertions(expect: NativeScriptExpect): void {
  expect.setState(initialAssertionState());
}

/**
 * Throws the error Vitest reports when a test attempt made fewer or more
 * assertions through `expect` than `expect.assertions`,
 * `expect.hasAssertions` or the `expect.requireAssertions` option asked for.
 */
export function verifyNativeScriptAssertions(
  expect: NativeScriptExpect,
  requireAssertions: boolean,
): void {
  const {
    assertionCalls,
    expectedAssertionsNumber,
    expectedAssertionsNumberErrorGen,
    isExpectingAssertions,
    isExpectingAssertionsError,
  } = expect.getState() as unknown as AssertionState;

  if (
    expectedAssertionsNumber !== null &&
    assertionCalls !== expectedAssertionsNumber &&
    expectedAssertionsNumberErrorGen
  ) {
    throw expectedAssertionsNumberErrorGen();
  }
  if (isExpectingAssertions && assertionCalls === 0) {
    throw isExpectingAssertionsError;
  }
  if (requireAssertions && assertionCalls === 0) {
    throw new Error('expected any number of assertion, but got none');
  }
}
