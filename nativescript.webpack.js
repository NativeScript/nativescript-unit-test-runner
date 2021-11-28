const { join, dirname } = require('path');
const { existsSync } = require('fs');
const { merge } = require('webpack-merge');
const { IgnorePlugin } = require('webpack');

function getTestEntrypoint(webpack) {
  const testTsEntryPath = join(webpack.Utils.platform.getEntryDirPath(), 'test.ts');
  const testJsEntryPath = join(webpack.Utils.platform.getEntryDirPath(), 'test.js');
  if (existsSync(testTsEntryPath)) {
    return testTsEntryPath;
  }
  if (existsSync(testJsEntryPath)) {
    return testJsEntryPath;
  }
  return null;
}

/**
 * @param {typeof import("@nativescript/webpack")} webpack
 */
module.exports = webpack => {
  if (!getTestEntrypoint(webpack)) {
    webpack.Utils.log.warn('Test entrypoint not found. Loading deprecated @nativescript/unit-test-runner config. Please update your unit testing config.');
    return require('./nativescript.webpack.compat')(webpack);
  }
  webpack.chainWebpack((config, env) => {
    if (env.unitTesting) {
      return setupUnitTestBuild(config, env, webpack);
    } else {
      config
        .plugin("IgnorePlugin|unit_tests")
        .use(IgnorePlugin, [{
          checkResource: (resource, context) => {
            if (context === webpack.Utils.platform.getEntryDirPath()) {
              if (/(^\.\/test|\.spec)\.(ts|js)$/.test(resource)) {
                // console.log('ignoring unit test', context, resource);
                return true;
              }
            }
            return false;

          }
        }]);
    }
  });
};

/**
 * @param {import("webpack-chain")} config
 * @param {typeof import("@nativescript/webpack")} webpack
 */
function setupUnitTestBuild(config, env, webpack) {

  const testEntrypointPath = getTestEntrypoint(webpack);
  if (!testEntrypointPath) { // this should never happen
    webpack.Utils.log.error('No test entrypoint found');
    return;
  }
  // config.plugins.delete('CleanWebpackPlugin');
  // config.output.set('clean', false);

  // harmless warnings
  config.set(
    'ignoreWarnings',
    (config.get('ignoreWarnings') || []).concat([
      /Can't resolve '@nativescript\/unit-test-runner\/app\/stop-process.js'/
    ])
  );

  const runnerPath = dirname(
    require.resolve('@nativescript/unit-test-runner/package.json')
  );
  config.module.rule('css').include.add(runnerPath);
  config.module.rule('xml').include.add(runnerPath);
  config.module.rule('js').include.add(runnerPath);
  if (!env.testTsConfig && env.testTSConfig) {
    webpack.Utils.log.warn('Mapping env.testTSConfig to env.testTsConfig');
  }
  env.testTsConfig = env.testTsConfig || env.testTSConfig;
  const defaultTsConfig = webpack.Utils.project.getProjectFilePath('tsconfig.spec.json');
  const tsConfigPath = env.testTsConfig || (require('fs').existsSync(defaultTsConfig) ? defaultTsConfig : undefined);
  if (tsConfigPath) {
    config.when(config.module.rules.has('ts'), (config) => config.module.rule('ts').uses.get('ts-loader').options(merge(config.module.rule('ts').uses.get('ts-loader').get('options'), { configFile: tsConfigPath })));
    config.when(config.plugins.has('AngularWebpackPlugin'), (config) => config.plugin('AngularWebpackPlugin').tap((args) => {
      args[0] = merge(args[0], { tsconfig: tsConfigPath });
      return args;
    }));
  }

  config.plugin('DefinePlugin').tap((args) => {
    args[0] = merge(args[0], {
      'global.TNS_WEBPACK': true,
    });

    return args;
  });

  if (env.codeCoverage) {
    config.module
      .rule('istanbul-loader')
      .enforce('post')
      .include
      .add(webpack.Utils.platform.getEntryDirPath())
      .end()
      .exclude
      .add(/\.spec\.(tsx?|jsx?)$/)
      .add(join(webpack.Utils.platform.getEntryDirPath(), 'tests'))
      .add(join(webpack.Utils.platform.getEntryDirPath(), 'test.ts'))
      .add(join(webpack.Utils.platform.getEntryDirPath(), 'test.js'))
      .end()
      .test(/\.(tsx?|jsx?)/)
      .use('@jsdevtools/coverage-istanbul-loader')
      .loader(require.resolve('@jsdevtools/coverage-istanbul-loader'))
      .options({ esModules: true });
  }

  // config.entryPoints.clear()
  config.entry('bundle')
    .clear()
    .add('@nativescript/core/globals/index.js')
    .add('@nativescript/core/bundle-entry-points')
    // .add('@nativescript/unit-test-runner/app/bundle-app')
    .add(testEntrypointPath);
  // .add('@nativescript/unit-test-runner/app/entry')
  // .add(entryPath);
  if (webpack.Utils.platform.getPlatformName() === 'android') {
    config.entry('bundle')
      .add('@nativescript/core/ui/frame')
      .add('@nativescript/core/ui/frame/activity');
  }
}
