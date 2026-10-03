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

// Proxy invariants require a property the proxy reports as non-configurable to
// exist, non-configurable, on the proxy target too.
function deviceExpectDescriptor(
  target: object,
  property: string | symbol,
): PropertyDescriptor | undefined {
  const descriptor = Reflect.getOwnPropertyDescriptor(
    getNativeScriptExpect(),
    property,
  );
  if (descriptor?.configurable === false) {
    Reflect.defineProperty(target, property, descriptor);
  }
  return descriptor;
}

// Property operations reach the device expect, which is set up on first use
// rather than on import because setting it up replaces the global expect.
// Freezing, sealing or changing the prototype is refused: those would apply to
// the proxy target alone and break the invariants of every later operation.
export const expect = new Proxy(
  (...arguments_: unknown[]) =>
    Reflect.apply(getNativeScriptExpect(), undefined, arguments_),
  {
    get: (_target, property) => Reflect.get(getNativeScriptExpect(), property),
    set: (_target, property, value) =>
      Reflect.set(getNativeScriptExpect(), property, value),
    has: (_target, property) => Reflect.has(getNativeScriptExpect(), property),
    deleteProperty: (_target, property) =>
      Reflect.deleteProperty(getNativeScriptExpect(), property),
    ownKeys: () => Reflect.ownKeys(getNativeScriptExpect()),
    getOwnPropertyDescriptor: deviceExpectDescriptor,
    defineProperty: (target, property, attributes) => {
      if (
        !Reflect.defineProperty(getNativeScriptExpect(), property, attributes)
      ) {
        return false;
      }
      deviceExpectDescriptor(target, property);
      return true;
    },
    preventExtensions: () => false,
    setPrototypeOf: () => false,
  },
) as unknown as ExpectStatic;
