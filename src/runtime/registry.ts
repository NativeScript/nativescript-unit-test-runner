export interface NativeScriptTestModuleRegistry {
  load(filepath: string): unknown;
}

export interface WebpackRequireContext {
  (key: string): unknown;
  keys(): string[];
}

export type TestModuleLoader = () => unknown | Promise<unknown>;
export type TestModuleMap = Readonly<Record<string, TestModuleLoader | unknown>>;

declare global {
  interface ImportMeta {
    /** Vite glob import: matches files and returns lazy module loaders. */
    glob<T = unknown>(
      pattern: string | string[],
      options?: {
        eager?: boolean;
        as?: string;
        [key: string]: unknown;
      },
    ): Record<string, () => Promise<T>>;
  }
}

function normalizePath(filepath: string): string {
  return filepath.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isWebpackContext(value: unknown): value is WebpackRequireContext {
  return (
    typeof value === 'function' &&
    typeof (value as WebpackRequireContext).keys === 'function'
  );
}

function executeWrappedModule(value: unknown): unknown {
  if (value && typeof value === 'object') {
    if ('then' in value && typeof (value as Promise<unknown>).then === 'function') {
      return (value as Promise<unknown>).then(executeWrappedModule);
    }
    if ('__run' in value && typeof (value as { __run: unknown }).__run === 'function') {
      return (value as { __run: () => unknown }).__run();
    }
  }
  return value;
}

/**
 * Creates a test registry for Webpack builds using `require.context(...)`.
 *
 * @example
 * ```ts
 * createWebpackTestRegistry((require as any).context('./', true, /\.test\.(js|ts)$/))
 * ```
 */
export function createWebpackTestRegistry(
  context: WebpackRequireContext | TestModuleMap,
): NativeScriptTestModuleRegistry {
  if (!isWebpackContext(context)) {
    return createViteTestRegistry(context);
  }

  const keys = context.keys();

  return {
    load(filepath: string): unknown {
      const target = normalizePath(filepath);
      const matches = keys.filter((key) => target.endsWith(normalizePath(key)));

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

/**
 * Creates a test registry for Vite builds using `import.meta.glob(...)`.
 */
export function createViteTestRegistry(
  modules: TestModuleMap | WebpackRequireContext,
): NativeScriptTestModuleRegistry {
  if (isWebpackContext(modules)) {
    return createWebpackTestRegistry(modules);
  }

  const entries = Object.entries(modules).map(
    ([path, loader]) => [normalizePath(path), loader] as const,
  );

  return {
    load(filepath: string): unknown {
      const target = normalizePath(filepath);
      const match = entries.find(([path]) => target.endsWith(path));

      if (!match) {
        throw new Error(`NativeScript test ${filepath} was not registered`);
      }

      const loader = match[1];
      const moduleValue =
        typeof loader === 'function' ? (loader as TestModuleLoader)() : loader;
      return executeWrappedModule(moduleValue);
    },
  };
}

/** Alias for `createViteTestRegistry` */
export const createNativeScriptTestRegistry = createViteTestRegistry;
