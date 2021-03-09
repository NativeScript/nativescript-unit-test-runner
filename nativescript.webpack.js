const {join, dirname} = require('path')

/**
 * @param {typeof import("@nativescript/webpack")} webpack
 */
module.exports = webpack => {
  webpack.chainWebpack((config, env) => {
    if (env.karmaWebpack) {
      return setupKarmaBuild(config, env, webpack)
    }

    if (env.unitTesting) {
      return setupUnitTestBuild(config, env, webpack)
    }
  })
}

function setupKarmaBuild(config, env, webpack) {
  const karmaWebpack = require('karma-webpack/lib/webpack/defaults')
  const defaults = karmaWebpack.create()
  delete defaults['optimization']

  karmaWebpack.create = () => {
    return defaults
  }

  console.log(karmaWebpack.create)
  console.log(karmaWebpack.create())

  config.entryPoints.clear();
  config.optimization.clear();

  config.plugins.delete('WatchStatePlugin')
  config.plugins.delete('CleanWebpackPlugin')


  // config.output.delete('libraryTarget')
  // config.output.delete('path')
  config.output.path(
    `${config.output.get('path')}/karma-webpack`
  )

  config.output.set('iife', true)
  config.output.set('libraryTarget', 'global')

  config.module
    .rule('unit-test')
    .test(/\.spec\.(ts|js)$/)
    .use('unit-test-loader')
    .loader(join(__dirname, 'loaders', 'unit-test-loader'))
    .options({
      appPath: webpack.Utils.platform.getEntryDirPath(),
    })
}

function setupUnitTestBuild(config, env, webpack) {
  config.plugins.delete('CleanWebpackPlugin')

  const runnerPath = dirname(
    require.resolve('@nativescript/unit-test-runner/package.json')
  )
  // console.log(runnerPath)
  config.module.rule('css').include.add(runnerPath)
  config.module.rule('xml').include.add(runnerPath)
  config.module.rule('js').include.add(runnerPath)

  const entryPath = webpack.Utils.virtualModules.addVirtualEntry(config, 'unit-test-runner', `
      // VIRTUAL ENTRY START
      const context = require.context(
        "~/",
        /* deep: */ true,
        /* filter: */ /tests\\/.*\.spec\.ts$/
      );
      global.registerWebpackModules(context);
      // VIRTUAL ENTRY END
    `)

  // config.entryPoints.clear()
  config.entry('bundle')
    .clear()
    .add('@nativescript/core/globals/index.js')
    .add('@nativescript/core/bundle-entry-points')
    .add('@nativescript/unit-test-runner/app/bundle-app')
    // .add('@nativescript/unit-test-runner/app/entry')
    .add(entryPath)
}
