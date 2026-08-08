import type { ExpectStatic } from '@vitest/expect';
import { getNativeScriptExpect } from './expect.js';

export {
  afterAll,
  afterEach,
  aroundAll,
  aroundEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  onTestFailed,
  onTestFinished,
  suite,
  test,
} from '@vitest/runner';

export const expect = ((...arguments_: unknown[]) =>
  Reflect.apply(
    getNativeScriptExpect(),
    undefined,
    arguments_,
  )) as ExpectStatic;
