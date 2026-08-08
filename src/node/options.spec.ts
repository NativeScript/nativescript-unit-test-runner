import { describe, expect, it } from 'vitest';
import {
  resolveNativeScriptPluginOptions,
  withNativeScriptCoverageLaunchCommand,
} from './options.js';

describe('resolveNativeScriptPluginOptions', () => {
  it('builds a supported local NativeScript CLI command', () => {
    const options = resolveNativeScriptPluginOptions(
      {
        platform: 'ios',
        appPath: 'demo',
        workers: 2,
        device: 'test-simulator',
      },
      '/workspace',
      8,
    );

    expect(options.appPath).toBe('/workspace/demo');
    expect(options.device).toBe('test-simulator');
    expect(options.launchCommand).toEqual({
      command: 'npx',
      args: [
        'ns',
        'run',
        'ios',
        '--no-hmr',
        '--env.unitTesting',
        '--env.testRunnerPort=17878',
        '--device',
        'test-simulator',
      ],
    });
  });

  it('runs on the main thread with no worker runtimes by default', () => {
    const options = resolveNativeScriptPluginOptions(
      { platform: 'android' },
      '/workspace',
      8,
    );

    expect(options.slots).toEqual({ main: true, workers: 0 });
    expect(options.host).toBe('127.0.0.1');
    expect(options.launch).toBe(true);
    expect(options.connectTimeout).toBe(120_000);
  });

  it('adds worker slots on top of the main thread', () => {
    expect(
      resolveNativeScriptPluginOptions(
        { platform: 'ios', workers: 2 },
        '/workspace',
        8,
      ).slots,
    ).toEqual({ main: true, workers: 2 });

    expect(
      resolveNativeScriptPluginOptions(
        { platform: 'ios', mainThread: false, workers: 'auto' },
        '/workspace',
        8,
      ).slots,
    ).toEqual({ main: false, workers: 4 });
  });

  it('requires at least one execution context', () => {
    expect(() =>
      resolveNativeScriptPluginOptions({
        platform: 'android',
        mainThread: false,
      }),
    ).toThrow(RangeError);
  });

  it('reverses the runner port over adb for Android only', () => {
    expect(
      resolveNativeScriptPluginOptions({ platform: 'android' }),
    ).toMatchObject({ adbReverse: true, adbPath: 'adb' });
    expect(resolveNativeScriptPluginOptions({ platform: 'ios' })).toMatchObject(
      { adbReverse: false },
    );
    expect(
      resolveNativeScriptPluginOptions({
        platform: 'android',
        adbReverse: false,
        adbPath: '/opt/android/platform-tools/adb',
      }),
    ).toMatchObject({
      adbReverse: false,
      adbPath: '/opt/android/platform-tools/adb',
    });
  });

  it('threads a custom port through the launch command', () => {
    expect(
      resolveNativeScriptPluginOptions(
        { platform: 'android', port: 19_100 },
        '/workspace',
        8,
      ).launchCommand.args,
    ).toContain('--env.testRunnerPort=19100');
  });

  it('validates the WebSocket port', () => {
    expect(() =>
      resolveNativeScriptPluginOptions({ platform: 'android', port: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      resolveNativeScriptPluginOptions({ platform: 'android', port: 70_000 }),
    ).toThrow(RangeError);
  });

  it('adds the coverage build flag without changing the original command', () => {
    const command = { command: 'npx', args: ['ns', 'run', 'ios'] };

    const coverageCommand = withNativeScriptCoverageLaunchCommand(command);

    expect(coverageCommand).toEqual({
      command: 'npx',
      args: ['ns', 'run', 'ios', '--env.codeCoverage'],
    });
    expect(command.args).toEqual(['ns', 'run', 'ios']);
    expect(withNativeScriptCoverageLaunchCommand(coverageCommand)).toBe(
      coverageCommand,
    );
  });
});
