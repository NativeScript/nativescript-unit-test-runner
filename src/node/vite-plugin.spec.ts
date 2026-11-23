import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import createUnitTestRunnerViteConfig, {
  unitTestRunner,
} from '../../nativescript.vite.mjs';

describe('nativescript.vite.mjs', () => {
  let tempDir: string;
  const originalArgv = [...process.argv];
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempDir = join(tmpdir(), `ns-vite-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    // Scaffold minimal NativeScript app structure
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test-app', main: 'src/app.ts' }),
    );
    writeFileSync(join(tempDir, 'src', 'app.ts'), 'console.log("app");');
    writeFileSync(join(tempDir, 'src', 'test.ts'), 'console.log("test");');
  });

  afterEach(() => {
    process.argv = [...originalArgv];
    process.env = { ...originalEnv };
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('when unit testing is inactive', () => {
    it('returns exclude-tests plugin by default when no flags are present', () => {
      delete process.env.NATIVESCRIPT_BUNDLER_ENV;
      delete process.env.NS_UNIT_TESTING;
      delete process.env.UNIT_TESTING;
      process.argv = ['node', 'vite'];

      const config = createUnitTestRunnerViteConfig({ cwd: tempDir }) as {
        plugins: Array<{
          name: string;
          resolveId: (source: string, importer?: string) => unknown;
          load: (id: string) => unknown;
        }>;
      };

      expect(config.plugins).toBeDefined();
      expect(config.plugins).toHaveLength(1);
      const plugin = config.plugins[0];
      expect(plugin.name).toBe('nativescript-unit-test-runner:exclude-tests');

      // Intercepts spec files imported from appDir
      const resolved = plugin.resolveId(
        './app.spec.ts',
        join(tempDir, 'src', 'some-module.ts'),
      );
      expect(resolved).toBe('\0virtual:ns-unit-test-empty');

      // Intercepts test.ts
      const resolvedTest = plugin.resolveId(
        './test.ts',
        join(tempDir, 'src', 'some-module.ts'),
      );
      expect(resolvedTest).toBe('\0virtual:ns-unit-test-empty');

      // Loads stub module
      const loaded = plugin.load('\0virtual:ns-unit-test-empty');
      expect(loaded).toEqual({ code: 'export default {};', moduleType: 'js' });

      // Does not intercept non-test files
      const nonTest = plugin.resolveId(
        './my-service.ts',
        join(tempDir, 'src', 'some-module.ts'),
      );
      expect(nonTest).toBeNull();
    });

    it('honors explicit unitTesting: false option', () => {
      process.env.NS_UNIT_TESTING = 'true';

      const config = createUnitTestRunnerViteConfig({
        cwd: tempDir,
        unitTesting: false,
      }) as { plugins: Array<{ name: string }> };

      expect(config.plugins[0].name).toBe(
        'nativescript-unit-test-runner:exclude-tests',
      );
    });
  });

  describe('when unit testing is active', () => {
    it('activates unit test build via options.unitTesting', () => {
      const config = createUnitTestRunnerViteConfig({
        cwd: tempDir,
        unitTesting: true,
        testRunnerPort: 18000,
      }) as {
        resolve: { alias: Array<{ find: unknown; replacement: string }> };
        define: Record<string, string>;
        optimizeDeps: { exclude: string[] };
        plugins: Array<{
          name: string;
          resolveId: (source: string, importer?: string) => unknown;
          transform: (code: string, id: string) => unknown;
          config?: (cfg: Record<string, unknown>) => void;
        }>;
      };

      expect(config.define.__NS_TEST_CONFIG__).toBe(
        JSON.stringify({ port: 18000 }),
      );
      expect(config.optimizeDeps.exclude).toContain('vitest');
      expect(config.optimizeDeps.exclude).toContain(
        '@nativescript/unit-test-runner',
      );

      // Aliases vitest to shim.js
      const vitestAlias = config.resolve.alias.find(
        (a) => a.find instanceof RegExp && a.find.test('vitest'),
      );
      expect(vitestAlias).toBeDefined();
      expect(vitestAlias?.replacement).toContain('dist/runtime/shim.js');

      // Aliases app entrypoint to test.ts
      const entryAlias = config.resolve.alias.find(
        (a) => a.find === '/src/app.ts',
      );
      expect(entryAlias).toBeDefined();
      expect(entryAlias?.replacement).toBe(join(tempDir, 'src', 'test.ts'));

      // Check entry redirect plugin
      const entryPlugin = config.plugins.find(
        (p) => p.name === 'nativescript-unit-test-runner:entry',
      );
      expect(entryPlugin).toBeDefined();

      // Resolves vitest directly
      expect(entryPlugin?.resolveId('vitest')).toContain('dist/runtime/shim.js');

      // Resolves main entry when imported by virtual:entry-with-polyfills
      const redirected = entryPlugin?.resolveId(
        '/src/app.ts',
        '\0virtual:entry-with-polyfills',
      );
      expect(redirected).toBe(join(tempDir, 'src', 'test.ts'));

      // Leaves non-entry imports intact
      const coreImport = entryPlugin?.resolveId(
        '@nativescript/core',
        '\0virtual:entry-with-polyfills',
      );
      expect(coreImport).toBeNull();

      // Transform fallback replaces main entry in virtual:entry-with-polyfills
      const transformed = entryPlugin?.transform(
        'import "/src/app.ts";',
        '\0virtual:entry-with-polyfills',
      );
      expect(transformed).toBe(
        `import "${join(tempDir, 'src', 'test.ts').replace(/\\/g, '/')}";`,
      );
    });

    it('named unitTestRunner export behaves identically to default export', () => {
      const config = unitTestRunner({
        cwd: tempDir,
        unitTesting: true,
      });

      expect(config).toBeDefined();
      expect(
        (config as { define: Record<string, string> }).define
          .__NS_TEST_CONFIG__,
      ).toBeDefined();
    });

    it('auto-detects unit testing from NATIVESCRIPT_BUNDLER_ENV', () => {
      process.env.NATIVESCRIPT_BUNDLER_ENV = JSON.stringify({
        unitTesting: true,
        testRunnerPort: 19500,
      });

      const config = createUnitTestRunnerViteConfig({
        cwd: tempDir,
      }) as {
        define: Record<string, string>;
      };

      expect(config.define.__NS_TEST_CONFIG__).toBe(
        JSON.stringify({ port: 19500 }),
      );
    });

    it('auto-detects unit testing from process.argv flags', () => {
      process.argv = [
        'node',
        'vite',
        '--env.unitTesting',
        '--env.testRunnerPort=20000',
      ];

      const config = createUnitTestRunnerViteConfig({
        cwd: tempDir,
      }) as {
        define: Record<string, string>;
      };

      expect(config.define.__NS_TEST_CONFIG__).toBe(
        JSON.stringify({ port: 20000 }),
      );
    });

    it('falls back to test.js when test.ts is absent', () => {
      rmSync(join(tempDir, 'src', 'test.ts'));
      writeFileSync(join(tempDir, 'src', 'test.js'), 'console.log("test.js");');

      const config = createUnitTestRunnerViteConfig({
        cwd: tempDir,
        unitTesting: true,
      }) as {
        resolve: { alias: Array<{ find: unknown; replacement: string }> };
      };

      const entryAlias = config.resolve.alias.find(
        (a) => a.find === '/src/app.ts',
      );
      expect(entryAlias?.replacement).toBe(join(tempDir, 'src', 'test.js'));
    });

    it('logs error when test entrypoint is missing', () => {
      rmSync(join(tempDir, 'src', 'test.ts'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const config = createUnitTestRunnerViteConfig({
        cwd: tempDir,
        unitTesting: true,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No test entrypoint'),
      );
      expect(config).toEqual({});
    });

    it('updates custom input in rollupOptions and rolldownOptions via config hook', () => {
      const config = createUnitTestRunnerViteConfig({
        cwd: tempDir,
        unitTesting: true,
      }) as {
        plugins: Array<{
          name: string;
          config?: (cfg: Record<string, any>) => void;
        }>;
      };

      const entryPlugin = config.plugins.find(
        (p) => p.name === 'nativescript-unit-test-runner:entry',
      );

      const customConfig: Record<string, any> = {
        build: {
          rollupOptions: { input: 'src/main.ts' },
          rolldownOptions: { input: 'src/main.ts' },
        },
      };

      entryPlugin?.config?.(customConfig);
      expect(customConfig.build.rollupOptions.input).toBe(
        join(tempDir, 'src', 'test.ts'),
      );
      expect(customConfig.build.rolldownOptions.input).toBe(
        join(tempDir, 'src', 'test.ts'),
      );
    });
  });


  describe('tsconfig and path aliases', () => {
    it('loads path mappings from tsconfig.spec.json', () => {
      writeFileSync(
        join(tempDir, 'tsconfig.spec.json'),
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@tests/*': ['tests/*'],
              '@custom-alias': ['src/custom.ts'],
            },
          },
        }),
      );

      const config = createUnitTestRunnerViteConfig({
        cwd: tempDir,
        unitTesting: true,
      }) as {
        resolve: { alias: Array<{ find: unknown; replacement: string }> };
      };

      const wildcardAlias = config.resolve.alias.find(
        (a) => a.find instanceof RegExp && a.find.test('@tests/foo'),
      );
      expect(wildcardAlias).toBeDefined();

      const exactAlias = config.resolve.alias.find(
        (a) => a.find === '@custom-alias',
      );
      expect(exactAlias).toBeDefined();
      expect(exactAlias?.replacement).toBe(join(tempDir, 'src', 'custom.ts'));
    });
  });

  describe('code coverage', () => {
    it('instruments source files when codeCoverage is true', () => {
      const config = createUnitTestRunnerViteConfig({
        cwd: tempDir,
        unitTesting: true,
        codeCoverage: true,
      }) as {
        plugins: Array<{
          name: string;
          transform: (code: string, id: string) => { code: string } | null;
        }>;
      };

      const istanbulPlugin = config.plugins.find(
        (p) => p.name === 'nativescript-unit-test-runner:istanbul',
      );
      expect(istanbulPlugin).toBeDefined();

      // Transform app source file
      const sourceCode = 'export function sum(a, b) { return a + b; }';
      const fileId = join(tempDir, 'src', 'calc.js');
      const transformed = istanbulPlugin?.transform(sourceCode, fileId);

      expect(transformed).toBeDefined();
      expect(transformed?.code).toContain('__VITEST_COVERAGE__');
      expect(transformed?.code).toContain('globalThis');

      // Does not instrument spec file
      const specId = join(tempDir, 'src', 'calc.spec.js');
      expect(istanbulPlugin?.transform(sourceCode, specId)).toBeNull();

      // Does not instrument test entrypoint
      const testId = join(tempDir, 'src', 'test.ts');
      expect(istanbulPlugin?.transform(sourceCode, testId)).toBeNull();

      // Does not instrument node_modules
      const nodeModulesId = join(tempDir, 'node_modules', 'some-pkg', 'index.js');
      expect(istanbulPlugin?.transform(sourceCode, nodeModulesId)).toBeNull();
    });

    it('enables code coverage via argv flag --env.codeCoverage', () => {
      process.argv = ['node', 'vite', '--env.unitTesting', '--env.codeCoverage'];

      const config = createUnitTestRunnerViteConfig({
        cwd: tempDir,
      }) as {
        plugins: Array<{ name: string }>;
      };

      const istanbulPlugin = config.plugins.find(
        (p) => p.name === 'nativescript-unit-test-runner:istanbul',
      );
      expect(istanbulPlugin).toBeDefined();
    });
  });
});
