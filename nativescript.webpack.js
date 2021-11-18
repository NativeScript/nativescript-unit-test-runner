const { join, dirname } = require('path');
const { merge } = require('webpack-merge');
const globRegex = require('glob-regex');

function getKarmaTestsRegex(webpack) {
  const karmaConfig = require(webpack.Utils.project.getProjectFilePath('karma.conf.js'));
  let filesRegex = karmaConfig.filesRegex ||
    new RegExp((karmaConfig.filePatterns || []).map((glob) =>
      globRegex(`./${glob}`).source // all webpack require.context start with `./` and glob-regex adds ^
    ).join('|'));

  if (!filesRegex || !filesRegex.source) {
    webpack.Utils.log.warn("Karma files regex not found, falling back to tests/**/*.ts");
    filesRegex = /tests\/.*\.ts/;
  }
  return filesRegex;
}

/**
 * @param {typeof import("@nativescript/webpack")} webpack
 */
module.exports = webpack => {
  webpack.chainWebpack((config, env) => {
    if (env.karmaWebpack) {
      return setupKarmaBuild(config, env, webpack);
    }

    if (env.unitTesting) {
      return setupUnitTestBuild(config, env, webpack);
    }
  });
};

/**
 * @param {import("webpack-chain")} config
 * @param {typeof import("@nativescript/webpack")} webpack
 */
function setupKarmaBuild(config, env, webpack) {
  const karmaWebpack = require('karma-webpack/lib/webpack/defaults');
  const defaults = karmaWebpack.create();
  delete defaults.optimization;

  karmaWebpack.create = () => {
    return defaults;
  };

  config.entryPoints.clear();
  config.optimization.clear();

  config.plugins.delete('WatchStatePlugin');
  config.plugins.delete('AngularCompilerPlugin');
  config.plugins.delete('AngularWebpackPlugin');
  config.module.rules.delete('angular');
  // config.plugins.delete('CleanWebpackPlugin')
  config.plugin('DefinePlugin').tap((args) => {
		args[0] = merge(args[0], {
			__TEST_RUNNER_STAY_OPEN__: !!env.stayOpen,
		});

		return args;
	});



  config.output.delete('path'); // use temp path
  config.output.set('iife', true);
  config.output.set('libraryTarget', 'global');
  config.output.set('clean', true);

  config.module
    .rule('unit-test')
    .enforce('post')
    .include.add(webpack.Utils.platform.getEntryDirPath()).end()
    .test(/\.(ts|js)/)
    .use('unit-test-loader')
    .loader(join(__dirname, 'loaders', 'unit-test-loader'))
    .options({
      appPath: webpack.Utils.platform.getEntryDirPath(),
      platform: webpack.Utils.platform.getPlatformName() 
    });
}

/**
 * @param {import("webpack-chain")} config
 * @param {typeof import("@nativescript/webpack")} webpack
 */
function setupUnitTestBuild(config, env, webpack) {
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
  const defaultTsConfig = webpack.Utils.project.getProjectFilePath('tsconfig.spec.json');
  const testTsEntryPath = join(webpack.Utils.platform.getEntryDirPath(), 'test.ts');
  const testJsEntryPath = join(webpack.Utils.platform.getEntryDirPath(), 'test.js');
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

  // config.entryPoints.clear()
  config.entry('bundle')
    .clear()
    .add('@nativescript/core/globals/index.js')
    .add('@nativescript/core/bundle-entry-points')
    // .add('@nativescript/unit-test-runner/app/bundle-app')
    .add(require('fs').existsSync(testTsEntryPath) ? testTsEntryPath : testJsEntryPath);
    // .add('@nativescript/unit-test-runner/app/entry')
    // .add(entryPath);
  if (webpack.Utils.platform.getPlatformName() === 'android') {
    config.entry('bundle')
      .add('@nativescript/core/ui/frame')
      .add('@nativescript/core/ui/frame/activity');
  }
}
