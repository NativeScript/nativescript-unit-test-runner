import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve, win32 } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Helpers: CLI & Environment
// ============================================================================

function getBundlerEnv() {
  try {
    return JSON.parse(process.env.NATIVESCRIPT_BUNDLER_ENV || '{}');
  } catch {
    return {};
  }
}

/**
 * Checks for a CLI argument across --env.<key>, --<key>, or --<key>=value.
 */
function getCliArg(name) {
  const envPrefix = `--env.${name}`;
  const directPrefix = `--${name}`;

  for (const arg of process.argv) {
    if (arg === envPrefix || arg === directPrefix) return 'true';
    if (arg.startsWith(`${envPrefix}=`)) return arg.slice(envPrefix.length + 1);
    if (arg.startsWith(`${directPrefix}=`)) return arg.slice(directPrefix.length + 1);
  }
  return undefined;
}

function isUnitTesting(options = {}, bundlerEnv = {}) {
  if (typeof options.unitTesting === 'boolean') return options.unitTesting;
  if (bundlerEnv.unitTesting) return true;

  const envVar = process.env.NS_UNIT_TESTING || process.env.UNIT_TESTING;
  if (envVar === 'true' || envVar === '1') return true;

  const cliVal = getCliArg('unitTesting');
  return cliVal !== undefined && cliVal !== 'false' && cliVal !== '0';
}

function resolveTestRunnerPort(options = {}, bundlerEnv = {}) {
  const candidates = [
    options.testRunnerPort,
    options.port,
    bundlerEnv.testRunnerPort,
    getCliArg('testRunnerPort'),
    process.env.NS_TEST_RUNNER_PORT,
  ];

  for (const val of candidates) {
    if (val !== undefined) {
      const parsed = Number(val);
      if (Number.isInteger(parsed)) return parsed;
    }
  }
  return undefined;
}

function resolveCodeCoverage(options = {}, bundlerEnv = {}) {
  if (typeof options.codeCoverage === 'boolean') return options.codeCoverage;
  if (bundlerEnv.codeCoverage) return true;

  const envVar = process.env.NS_CODE_COVERAGE;
  if (envVar === 'true' || envVar === '1') return true;

  const cliVal = getCliArg('codeCoverage');
  return cliVal !== undefined && cliVal !== 'false' && cliVal !== '0';
}

function resolveTestTsConfig(projectRoot, options = {}, bundlerEnv = {}) {
  if (!options.testTsConfig && options.testTSConfig) {
    console.warn(
      '[@nativescript/unit-test-runner] Mapping options.testTSConfig to options.testTsConfig',
    );
  }

  const custom =
    options.testTsConfig ||
    options.testTSConfig ||
    bundlerEnv.testTsConfig ||
    bundlerEnv.testTSConfig ||
    getCliArg('testTsConfig') ||
    getCliArg('testTSConfig');

  if (custom) return resolve(projectRoot, custom);

  const defaultTsConfig = resolve(projectRoot, 'tsconfig.spec.json');
  return existsSync(defaultTsConfig) ? defaultTsConfig : undefined;
}

// ============================================================================
// Helpers: Paths & Project Inspection
// ============================================================================

function looksLikeWindowsPath(pathStr) {
  return /^[A-Za-z]:[\\/]/.test(pathStr) || pathStr.startsWith('\\\\');
}

function toStaticImportSpecifier(projectRoot, filePath) {
  const pathApi = looksLikeWindowsPath(projectRoot) || looksLikeWindowsPath(filePath)
    ? win32
    : posix;

  try {
    const rel = pathApi.relative(projectRoot, filePath);
    if (rel && !pathApi.isAbsolute(rel) && !rel.startsWith('..')) {
      return ('/' + rel.replace(/\\/g, '/')).replace(/\/+/g, '/');
    }
  } catch {}

  return pathToFileURL(filePath).toString();
}

function getProjectPackageJson(projectRoot) {
  try {
    const pkgPath = join(projectRoot, 'package.json');
    if (existsSync(pkgPath)) {
      return JSON.parse(readFileSync(pkgPath, 'utf8'));
    }
  } catch {}
  return {};
}

function getProjectAppPath(projectRoot, packageJson, options = {}) {
  if (options.appPath) return options.appPath;

  for (const configName of [
    'nativescript.config.ts',
    'nativescript.config.js',
    'nativescript.config.mjs',
  ]) {
    const configPath = join(projectRoot, configName);
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf8');
        const match = content.match(/appPath\s*:\s*['"]([^'"]+)['"]/);
        if (match?.[1]) {
          return match[1].replace(/^[./\\]+/, '').replace(/[/\\]+$/, '');
        }
      } catch {}
    }
  }

  const main = packageJson.main;
  if (main) {
    const segments = main.replace(/\\/g, '/').replace(/^\.?\/+/, '').split('/').filter(Boolean);
    if (segments.length >= 2) return segments[0];
  }

  if (existsSync(join(projectRoot, 'src'))) return 'src';
  if (existsSync(join(projectRoot, 'app'))) return 'app';
  return 'src';
}

function getTestEntrypoint(projectRoot, appPath) {
  const candidates = [
    join(projectRoot, appPath),
    join(projectRoot, 'src'),
    join(projectRoot, 'app'),
    projectRoot,
  ];

  for (const dir of candidates) {
    const testTs = join(dir, 'test.ts');
    if (existsSync(testTs)) return testTs;
    const testJs = join(dir, 'test.js');
    if (existsSync(testJs)) return testJs;
  }
  return null;
}

function isSameFile(projectRoot, source, target) {
  try {
    const absSource = source.startsWith('file://')
      ? fileURLToPath(source)
      : resolve(projectRoot, source.replace(/^\//, ''));
    const absTarget = isAbsolute(target) ? target : resolve(projectRoot, target);
    if (absSource === absTarget) return true;

    const stripExt = (p) => p.replace(/\.[cm]?[jt]sx?$/, '');
    return stripExt(absSource) === stripExt(absTarget);
  } catch {
    return false;
  }
}

function getTsConfigPathMappings(tsConfigPath) {
  try {
    const raw = readFileSync(tsConfigPath, 'utf8');
    const clean = raw
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,(\s*[}\]])/g, '$1');
    const parsed = JSON.parse(clean);
    const paths = parsed.compilerOptions?.paths || {};
    const baseUrl = parsed.compilerOptions?.baseUrl || '.';
    const baseDir = resolve(dirname(tsConfigPath), baseUrl);

    const aliases = [];
    for (const [key, values] of Object.entries(paths)) {
      if (Array.isArray(values) && values.length > 0) {
        const target = resolve(baseDir, values[0]);
        if (key.includes('*')) {
          const prefix = key.replace(/\/\*$/, '');
          const targetPrefix = target.replace(/[\\/]\*$/, '');
          aliases.push({
            find: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(.*)$`),
            replacement: `${targetPrefix}/$1`,
          });
        } else {
          aliases.push({ find: key, replacement: target });
        }
      }
    }
    return aliases;
  } catch {
    return [];
  }
}

// ============================================================================
// Plugins
// ============================================================================

/**
 * When unit testing is inactive, stub test files so they don't bloat the bundle.
 */
function createExcludeTestsPlugin(projectRoot, appPath) {
  const appDir = resolve(projectRoot, appPath);

  return {
    name: 'nativescript-unit-test-runner:exclude-tests',
    resolveId(source, importer) {
      if (!importer) return null;
      const cleanImporter = importer.split('?')[0].replace(/\\/g, '/');
      const normalizedAppDir = appDir.replace(/\\/g, '/');

      if (cleanImporter.startsWith(normalizedAppDir)) {
        if (
          /(^\.\/test|\.spec)\.(ts|js)$/.test(source) ||
          /\.(spec|test)\.[cm]?[jt]sx?$/.test(source)
        ) {
          return '\0virtual:ns-unit-test-empty';
        }
      }
      return null;
    },
    load(id) {
      if (id === '\0virtual:ns-unit-test-empty') {
        return { code: 'export default {};', moduleType: 'js' };
      }
      return null;
    },
  };
}

/**
 * Instruments app code using Istanbul when code coverage is enabled.
 */
function createIstanbulPlugin(projectRoot, appPath) {
  const appDir = resolve(projectRoot, appPath);

  return {
    name: 'nativescript-unit-test-runner:istanbul',
    enforce: 'post',
    transform(code, id) {
      const cleanId = id.split('?')[0];
      if (!/\.[cm]?[jt]sx?$/.test(cleanId)) return null;

      if (
        cleanId.includes('/node_modules/') ||
        cleanId.startsWith('\0') ||
        cleanId.startsWith('virtual:') ||
        /\.spec\.[cm]?[jt]sx?$/.test(cleanId) ||
        /\/tests\//.test(cleanId) ||
        /\/test\.[jt]s$/.test(cleanId)
      ) {
        return null;
      }

      const normalizedAppDir = appDir.replace(/\\/g, '/');
      const normalizedId = cleanId.replace(/\\/g, '/');
      if (!normalizedId.startsWith(normalizedAppDir)) return null;

      try {
        const { transformSync } = require('@babel/core');
        const istanbulPlugin = require('babel-plugin-istanbul');

        const result = transformSync(code, {
          filename: cleanId,
          cwd: projectRoot,
          sourceMaps: true,
          inputSourceMap: false,
          plugins: [
            [
              istanbulPlugin,
              {
                cwd: projectRoot,
                coverageVariable: '__VITEST_COVERAGE__',
                coverageGlobalScope: 'globalThis',
                coverageGlobalScopeFunc: false,
              },
            ],
          ],
        });

        if (result?.code) {
          return { code: result.code, map: result.map };
        }
      } catch (err) {
        console.warn(
          `[@nativescript/unit-test-runner] Failed to instrument ${cleanId} for coverage:`,
          err,
        );
      }
      return null;
    },
  };
}

/**
 * Redirects entrypoint from standard app main to test.ts / test.js and provides vitest shims.
 */
function createMainEntryPlugin({
  projectRoot,
  testEntrypointPath,
  mainEntry,
  mainEntryImportSpecifier,
  shimPath,
}) {
  return {
    name: 'nativescript-unit-test-runner:entry',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'vitest') return shimPath;

      if (
        importer &&
        (importer === '\0virtual:entry-with-polyfills' ||
          importer.includes('virtual:entry-with-polyfills'))
      ) {
        if (
          source === mainEntryImportSpecifier ||
          source === mainEntry ||
          isSameFile(projectRoot, source, mainEntry)
        ) {
          return testEntrypointPath;
        }
      }
      return null;
    },
    transform(code, id) {
      if (
        id &&
        id.includes('virtual:entry-with-polyfills') &&
        mainEntryImportSpecifier &&
        code.includes(mainEntryImportSpecifier)
      ) {
        return code.replace(
          mainEntryImportSpecifier,
          testEntrypointPath.replace(/\\/g, '/'),
        );
      }
      return null;
    },
    config(config) {
      const updateInput = (opts) => {
        if (opts?.input && opts.input !== 'virtual:entry-with-polyfills') {
          opts.input = testEntrypointPath;
        }
      };
      updateInput(config.build?.rollupOptions);
      updateInput(config.build?.rolldownOptions);
    },
  };
}

// ============================================================================
// Main Vite Configuration
// ============================================================================

/**
 * Configures Vite for NativeScript on-device unit testing.
 * Automatically discovered by @nativescript/vite via nativescript.vite.mjs.
 *
 * @param {object} [options]
 * @returns {import('vite').UserConfig}
 */
export default function createUnitTestRunnerViteConfig(options = {}) {
  const bundlerEnv = getBundlerEnv();
  const projectRoot = options.projectRoot || options.cwd || process.cwd();
  const packageJson = getProjectPackageJson(projectRoot);
  const appPath = getProjectAppPath(projectRoot, packageJson, options);

  // Inactive mode: stub test files to exclude them from the app bundle
  if (!isUnitTesting(options, bundlerEnv)) {
    return {
      plugins: [createExcludeTestsPlugin(projectRoot, appPath)],
    };
  }

  // Active mode: configure test entrypoint and aliases
  const testEntrypointPath = getTestEntrypoint(projectRoot, appPath);
  if (!testEntrypointPath) {
    console.error(
      '[@nativescript/unit-test-runner] No test entrypoint (test.ts or test.js) found in the app source directory. Run `ns test init` to scaffold one.',
    );
    return {};
  }

  const shimPath = resolve(__dirname, 'dist', 'runtime', 'shim.js');
  if (!existsSync(shimPath)) {
    console.error(
      '[@nativescript/unit-test-runner] @nativescript/unit-test-runner is not built. Reinstall the package.',
    );
    return {};
  }

  const mainEntryRaw = packageJson.main || join(appPath, 'app.ts');
  const mainEntry = resolve(projectRoot, mainEntryRaw);
  const mainEntryImportSpecifier = toStaticImportSpecifier(projectRoot, mainEntry);

  const aliases = [{ find: /^vitest$/, replacement: shimPath }];
  if (mainEntryImportSpecifier) {
    aliases.push({ find: mainEntryImportSpecifier, replacement: testEntrypointPath });
  }

  const testTsConfigPath = resolveTestTsConfig(projectRoot, options, bundlerEnv);
  if (testTsConfigPath) {
    aliases.push(...getTsConfigPathMappings(testTsConfigPath));
  }

  const testRunnerPort = resolveTestRunnerPort(options, bundlerEnv);
  const defines = {
    __NS_TEST_CONFIG__: JSON.stringify({
      port: Number.isInteger(testRunnerPort) ? testRunnerPort : undefined,
    }),
  };

  const plugins = [
    createMainEntryPlugin({
      projectRoot,
      testEntrypointPath,
      mainEntry,
      mainEntryImportSpecifier,
      shimPath,
    }),
  ];

  if (resolveCodeCoverage(options, bundlerEnv)) {
    plugins.push(createIstanbulPlugin(projectRoot, appPath));
  }

  return {
    resolve: { alias: aliases },
    define: defines,
    optimizeDeps: {
      exclude: ['vitest', '@nativescript/unit-test-runner'],
    },
    plugins,
  };
}

export { createUnitTestRunnerViteConfig as unitTestRunner };
