const { existsSync } = require('node:fs');
const { join } = require('node:path');

function getTestEntrypoint(webpack) {
  const entryDirPath = webpack.Utils.platform.getEntryDirPath();
  const testTsEntryPath = join(entryDirPath, 'test.ts');
  if (existsSync(testTsEntryPath)) return testTsEntryPath;
  const testJsEntryPath = join(entryDirPath, 'test.js');
  if (existsSync(testJsEntryPath)) return testJsEntryPath;
  return null;
}

/**
 * @param {typeof import("@nativescript/webpack")} webpack
 */
module.exports = (webpack) => {
  webpack.chainWebpack((config, env) => {
    if (env.unitTesting) {
      setupUnitTestBuild(config, env, webpack);
    } else {
      excludeTestFilesFromBundle(config, webpack);
    }
  });
};

/**
 * @param {import("webpack-chain")} config
 * @param {typeof import("@nativescript/webpack")} webpack
 */
function excludeTestFilesFromBundle(config, webpack) {
  const { IgnorePlugin } = require('webpack');
  config.plugin('IgnorePlugin|unit_tests').use(IgnorePlugin, [
    {
      checkResource: (resource, context) => {
        if (context === webpack.Utils.platform.getEntryDirPath()) {
          return /(^\.\/test|\.spec)\.(ts|js)$/.test(resource);
        }
        return false;
      },
    },
  ]);
}

/**
 * @param {import("webpack-chain")} config
 * @param {typeof import("@nativescript/webpack")} webpack
 */
function setupUnitTestBuild(config, env, webpack) {
  const testEntrypointPath = getTestEntrypoint(webpack);
  if (!testEntrypointPath) {
    webpack.Utils.log.error(
      'No test entrypoint (test.ts or test.js) found in the app source directory. Run `ns test init` to scaffold one.',
    );
    return;
  }

  const shimPath = join(__dirname, 'dist', 'runtime', 'shim.js');
  if (!existsSync(shimPath)) {
    webpack.Utils.log.error(
      '@nativescript/unit-test-runner is not built. Reinstall the package.',
    );
    return;
  }
  // Bare `vitest` imports in bundled specs resolve to the device-safe shim
  // (@vitest/runner + @vitest/expect); the full vitest package is Node-only.
  config.resolve.alias.set('vitest$', shimPath);

  if (!env.testTsConfig && env.testTSConfig) {
    webpack.Utils.log.warn('Mapping env.testTSConfig to env.testTsConfig');
  }
  env.testTsConfig = env.testTsConfig || env.testTSConfig;
  const defaultTsConfig =
    webpack.Utils.project.getProjectFilePath('tsconfig.spec.json');
  const tsConfigPath =
    env.testTsConfig || (existsSync(defaultTsConfig) ? defaultTsConfig : undefined);
  if (tsConfigPath) {
    config.when(config.module.rules.has('ts'), (config) =>
      config.module
        .rule('ts')
        .uses.get('ts-loader')
        .options({
          ...config.module.rule('ts').uses.get('ts-loader').get('options'),
          configFile: tsConfigPath,
        }),
    );
    config.when(config.plugins.has('AngularWebpackPlugin'), (config) =>
      config.plugin('AngularWebpackPlugin').tap((args) => {
        args[0] = { ...args[0], tsconfig: tsConfigPath };
        return args;
      }),
    );
  }

  // Angular unit tests require JIT: AOT compilation strips the metadata
  // TestBed needs to override components/providers at runtime.
  config.when(config.plugins.has('AngularWebpackPlugin'), (config) =>
    config.plugin('AngularWebpackPlugin').tap((args) => {
      args[0] = { ...args[0], jitMode: true };
      return args;
    }),
  );
  config.when(config.module.rules.has('angular-webpack-loader'), (config) => {
    const rule = config.module.rule('angular-webpack-loader');
    rule.uses
      .get('webpack-loader')
      .options({
        ...rule.uses.get('webpack-loader').get('options'),
        aot: false,
        optimize: false,
      });
  });

  const testRunnerPort = Number(env.testRunnerPort);
  config.plugin('DefinePlugin').tap((args) => {
    args[0] = {
      ...args[0],
      'global.TNS_WEBPACK': true,
      __NS_TEST_CONFIG__: JSON.stringify({
        port: Number.isInteger(testRunnerPort) ? testRunnerPort : undefined,
      }),
    };
    return args;
  });

  if (env.codeCoverage) {
    const entryDirPath = webpack.Utils.platform.getEntryDirPath();
    // Device runtimes expose no V8 coverage APIs, so Istanbul instruments the
    // bundle; the worker runtime forwards __VITEST_COVERAGE__ to the host,
    // where @vitest/coverage-istanbul picks it up.
    config.module
      .rule('vitest-istanbul')
      .enforce('post')
      .test(/\.[cm]?[jt]sx?$/)
      .include.add(entryDirPath)
      .end()
      .exclude.add(/\.spec\.[cm]?[jt]sx?$/)
      .add(join(entryDirPath, 'tests'))
      .add(join(entryDirPath, 'test.ts'))
      .add(join(entryDirPath, 'test.js'))
      .end()
      .use('babel-istanbul')
      .loader(require.resolve('babel-loader'))
      .options({
        sourceMaps: true,
        plugins: [
          [
            require.resolve('babel-plugin-istanbul'),
            {
              coverageVariable: '__VITEST_COVERAGE__',
              coverageGlobalScope: 'globalThis',
              coverageGlobalScopeFunc: false,
            },
          ],
        ],
      });
  }

  config
    .entry('bundle')
    .clear()
    .add('@nativescript/core/globals/index.js')
    .add('@nativescript/core/bundle-entry-points')
    .add(testEntrypointPath);
  if (webpack.Utils.platform.getPlatformName() === 'android') {
    // The static binding generator needs these modules in the bundle to
    // generate com.tns.NativeScriptActivity and its callbacks.
    config
      .entry('bundle')
      .add('@nativescript/core/ui/frame')
      .add('@nativescript/core/ui/frame/activity');
  }
}
