import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import {
  DEFAULT_NATIVE_SCRIPT_VITEST_PORT,
  totalSlots,
  type NativeScriptSlotLayout,
} from '../protocol.js';
import type { NativeScriptWorkerCount } from '../threading.js';
import { resolveNativeScriptWorkerCount } from '../threading.js';

export { DEFAULT_NATIVE_SCRIPT_VITEST_PORT } from '../protocol.js';

export type NativeScriptPlatform = 'android' | 'ios' | 'visionos' | 'tvos';

/**
 * Canonical platform ids plus the loose spellings that reach the plugin via
 * NS_PLATFORM or the NativeScript CLI (`iOS`, `visionOS`, `vision`, ...).
 */
export type NativeScriptPlatformInput = NativeScriptPlatform | (string & {});

const NATIVE_SCRIPT_PLATFORMS: readonly NativeScriptPlatform[] = [
  'android',
  'ios',
  'visionos',
  'tvos',
];

const NATIVE_SCRIPT_PLATFORM_ALIASES: Record<string, NativeScriptPlatform> = {
  vision: 'visionos',
};

export function normalizeNativeScriptPlatform(
  platform: NativeScriptPlatformInput,
): NativeScriptPlatform {
  const lowered = String(platform).toLowerCase();
  const normalized = NATIVE_SCRIPT_PLATFORM_ALIASES[lowered] ?? lowered;
  if (!NATIVE_SCRIPT_PLATFORMS.includes(normalized as NativeScriptPlatform)) {
    throw new RangeError(
      `Unknown NativeScript platform '${String(platform)}'. Supported platforms: ${NATIVE_SCRIPT_PLATFORMS.join(', ')}`,
    );
  }
  return normalized as NativeScriptPlatform;
}

export interface NativeScriptLaunchCommand {
  command: string;
  args: string[];
}

export interface NativeScriptPluginOptions {
  platform: NativeScriptPlatformInput;
  /** NativeScript app root (where nativescript.config.ts lives). Defaults to the Vitest root. */
  appPath?: string;
  /**
   * Run specs on the application's main (UI) thread. This is the default and
   * is required for tests that create Views, navigate Frames, or touch any
   * other UI API.
   */
  mainThread?: boolean;
  /** Additional isolated NativeScript Worker runtimes for parallel non-UI specs. */
  workers?: NativeScriptWorkerCount;
  host?: string;
  port?: number;
  device?: string;
  launch?: boolean;
  launchCommand?: NativeScriptLaunchCommand;
  /**
   * Map the device's 127.0.0.1:<port> to this host via `adb reverse` so
   * physical Android devices reach the runner over USB instead of LAN.
   */
  adbReverse?: boolean;
  adbPath?: string;
  connectTimeout?: number;
  include?: string[];
}

export interface ResolvedNativeScriptPluginOptions {
  platform: NativeScriptPlatform;
  appPath: string;
  slots: NativeScriptSlotLayout;
  host: string;
  port: number;
  device?: string;
  launch: boolean;
  launchCommand: NativeScriptLaunchCommand;
  adbReverse: boolean;
  adbPath: string;
  connectTimeout: number;
  include: string[];
}

const DEFAULT_INCLUDE = [
  'app/**/*.spec.ts',
  'app/**/*.spec.js',
  'src/**/*.spec.ts',
  'src/**/*.spec.js',
];

const COVERAGE_ENVIRONMENT_FLAG = '--env.codeCoverage';

export function withNativeScriptCoverageLaunchCommand(
  launchCommand: NativeScriptLaunchCommand,
): NativeScriptLaunchCommand {
  if (launchCommand.args.includes(COVERAGE_ENVIRONMENT_FLAG)) {
    return launchCommand;
  }

  return {
    ...launchCommand,
    args: [...launchCommand.args, COVERAGE_ENVIRONMENT_FLAG],
  };
}

export function resolveNativeScriptPluginOptions(
  options: NativeScriptPluginOptions,
  cwd = process.cwd(),
  parallelism = availableParallelism(),
): ResolvedNativeScriptPluginOptions {
  const platform = normalizeNativeScriptPlatform(options.platform);
  const port = options.port ?? DEFAULT_NATIVE_SCRIPT_VITEST_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError(
      'NativeScript Vitest port must be between 1 and 65535',
    );
  }

  const slots: NativeScriptSlotLayout = {
    main: options.mainThread ?? true,
    workers: resolveNativeScriptWorkerCount(options.workers, parallelism),
  };
  if (totalSlots(slots) === 0) {
    throw new RangeError(
      'NativeScript Vitest needs at least one execution context: enable mainThread or set workers > 0',
    );
  }

  const appPath = resolve(cwd, options.appPath ?? '.');
  const defaultArgs = [
    'ns',
    'run',
    platform,
    '--no-hmr',
    '--env.unitTesting',
    `--env.testRunnerPort=${port}`,
  ];
  if (options.device) defaultArgs.push('--device', options.device);

  return {
    platform,
    appPath,
    slots,
    host: options.host ?? '127.0.0.1',
    port,
    device: options.device,
    launch: options.launch ?? true,
    launchCommand: options.launchCommand ?? {
      command: 'npx',
      args: defaultArgs,
    },
    adbReverse: options.adbReverse ?? platform === 'android',
    adbPath: options.adbPath ?? 'adb',
    connectTimeout: options.connectTimeout ?? 120_000,
    include: options.include ?? DEFAULT_INCLUDE,
  };
}
