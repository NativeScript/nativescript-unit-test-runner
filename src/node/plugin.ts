import type { PoolRunnerInitializer, VitestPluginContext } from 'vitest/node';
import { defaultInclude } from 'vitest/config';
import { totalSlots } from '../protocol.js';
import type { NativeScriptPluginOptions } from './options.js';
import {
  resolveNativeScriptPluginOptions,
  withNativeScriptCoverageLaunchCommand,
} from './options.js';
import { NativeScriptPoolWorker } from './pool-worker.js';
import { WebSocketNativeScriptPoolSession } from './session.js';

export interface NativeScriptPlugin {
  name: 'nativescript-unit-test-runner';
  configureVitest(context: VitestPluginContext): void;
}

function usesVitestDefaultInclude(include: readonly string[]): boolean {
  return (
    include.length === defaultInclude.length &&
    include.every((pattern, index) => pattern === defaultInclude[index])
  );
}

export function nativeScript(
  options: NativeScriptPluginOptions,
): NativeScriptPlugin {
  const resolved = resolveNativeScriptPluginOptions(options);
  const slotCount = totalSlots(resolved.slots);

  return {
    name: 'nativescript-unit-test-runner',
    configureVitest({ project }: VitestPluginContext): void {
      const session = new WebSocketNativeScriptPoolSession({
        ...resolved,
        launchCommand:
          project.config.coverage?.enabled === true
            ? withNativeScriptCoverageLaunchCommand(resolved.launchCommand)
            : resolved.launchCommand,
      });
      let nextSlot = 0;

      const poolRunner: PoolRunnerInitializer = {
        name: 'nativescript',
        createPoolWorker: () => {
          const slot = nextSlot % slotCount;
          nextSlot += 1;
          return new NativeScriptPoolWorker(slot, session);
        },
      };

      project.config.pool = poolRunner.name;
      project.config.poolRunner = poolRunner;
      project.config.maxWorkers = slotCount;
      // The device owns a fixed set of long-lived runtimes (main thread +
      // Workers). Reusing each matching pool runner keeps its host-side
      // lifecycle aligned with the device slot and avoids assigning two files
      // to one slot concurrently.
      project.config.isolate = false;
      if (
        options.include ||
        !project.config.include ||
        usesVitestDefaultInclude(project.config.include)
      ) {
        project.config.include = resolved.include;
      }
    },
  };
}
