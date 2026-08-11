export interface NativeScriptTestModuleRegistry {
  load(filepath: string): unknown;
}

export interface WebpackRequireContext {
  (key: string): unknown;
  keys(): string[];
}

function normalizePath(filepath: string): string {
  return filepath.replaceAll('\\', '/').replace(/^\.\//, '');
}

function executeWrappedModule(moduleValue: unknown): unknown {
  if (
    typeof moduleValue === 'object' &&
    moduleValue !== null &&
    '__run' in moduleValue &&
    typeof moduleValue.__run === 'function'
  ) {
    return moduleValue.__run();
  }
  return moduleValue;
}

export function createWebpackTestRegistry(
  context: WebpackRequireContext,
): NativeScriptTestModuleRegistry {
  const keys = context.keys();

  return {
    load(filepath: string): unknown {
      const normalizedFile = normalizePath(filepath);
      const matches = keys.filter((key) =>
        normalizedFile.endsWith(normalizePath(key)),
      );

      if (matches.length !== 1) {
        const reason =
          matches.length === 0
            ? 'was not bundled'
            : `matched more than one bundled module: ${matches.join(', ')}`;
        throw new Error(`NativeScript test ${filepath} ${reason}`);
      }

      return executeWrappedModule(context(matches[0]));
    },
  };
}

export function createNativeScriptTestRegistry(
  modules: Readonly<Record<string, () => unknown>>,
): NativeScriptTestModuleRegistry {
  const entries = Object.entries(modules).map(
    ([path, load]) => [normalizePath(path), load] as const,
  );

  return {
    load(filepath: string): unknown {
      const normalizedFile = normalizePath(filepath);
      const match = entries.find(([path]) => normalizedFile.endsWith(path));
      if (!match) {
        throw new Error(`NativeScript test ${filepath} was not registered`);
      }
      return executeWrappedModule(match[1]());
    },
  };
}
