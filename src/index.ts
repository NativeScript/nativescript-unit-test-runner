export { nativeScript } from './node/plugin.js';
export type { NativeScriptPlugin } from './node/plugin.js';
export type {
  NativeScriptLaunchCommand,
  NativeScriptPlatform,
  NativeScriptPluginOptions,
  ResolvedNativeScriptPluginOptions,
} from './node/options.js';
export {
  DEFAULT_NATIVE_SCRIPT_VITEST_PORT,
  resolveNativeScriptPluginOptions,
} from './node/options.js';
export type {
  NativeScriptSlotLayout,
  NativeScriptTestDescriptor,
  NativeScriptTestEvent,
  NativeScriptTestEventListener,
  NativeScriptTestEventSource,
  NativeScriptTestState,
  NativeScriptVitestWireMessage,
} from './protocol.js';
export {
  NATIVE_SCRIPT_VITEST_PROTOCOL_VERSION,
  isNativeScriptVitestWireMessage,
  totalSlots,
} from './protocol.js';
export type { NativeScriptWorkerCount } from './threading.js';
export { resolveNativeScriptWorkerCount } from './threading.js';
