export interface NativeScriptUnitTestViteOptions {
  /** Explicitly toggle unit testing mode. Defaults to auto-detecting CLI/environment flags. */
  unitTesting?: boolean;
  /** Test runner WebSocket port on host. */
  testRunnerPort?: number;
  /** Alias for testRunnerPort. */
  port?: number;
  /** Enable Istanbul code coverage instrumentation. */
  codeCoverage?: boolean;
  /** Custom tsconfig path for tests (defaults to tsconfig.spec.json). */
  testTsConfig?: string;
  testTSConfig?: string;
  /** App source directory relative to project root (e.g. 'src' or 'app'). */
  appPath?: string;
  /** Project root directory (defaults to process.cwd()). */
  projectRoot?: string;
  cwd?: string;
}

// @ts-ignore - nativescript.vite.mjs is an untyped ESM file
import createConfig, { unitTestRunner as namedRunner } from '../nativescript.vite.mjs';

export const unitTestRunner: (
  options?: NativeScriptUnitTestViteOptions,
) => Record<string, unknown> = namedRunner;

export default createConfig as (
  options?: NativeScriptUnitTestViteOptions,
) => Record<string, unknown>;
