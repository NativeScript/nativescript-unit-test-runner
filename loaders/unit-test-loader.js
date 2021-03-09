const {relative, extname} = require('path')

/**
 * Unit Test Loader
 *
 * Replaces test source with a loadModule call
 * This allows us to use eval to run the tests
 * and pre-bundle them with the app.
 */
module.exports = function unitTestLoader(source, map) {
  const opts = this.getOptions()
  const testPathRelativeToAppPath = relative(opts.appPath, this.resourcePath)
  const ext = extname(testPathRelativeToAppPath);
  const loadPath = testPathRelativeToAppPath.replace(ext, "")

  source = `
    // UNIT-TEST-LOADER START
    try {
      console.log('Loading test: ${loadPath}');
      global.loadModule('${loadPath}');
    } catch(err) {
      console.log('Failed to load test ${loadPath}.', err)
    }
    // UNIT-TEST-LOADER END
  `;

  this.callback(null, source, map);
}
