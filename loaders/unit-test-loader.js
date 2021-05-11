const {relative, extname, sep} = require('path');

/**
 * Unit Test Loader
 *
 * Replaces test source with a loadModule call
 * This allows us to use eval to run the tests
 * and pre-bundle them with the app.
 */
module.exports = function unitTestLoader(source, map) {
  const opts = this.getOptions();
  const testPathRelativeToAppPath = relative(opts.appPath, this.resourcePath);
  const ext = extname(testPathRelativeToAppPath);
  const loadPath = testPathRelativeToAppPath.replace(ext, "").replace(sep, '/'); // use forward slash always

  if (loadPath) {
    const platformExt = loadPath.split('.').slice(-1)[0];
    if (['ios', 'android'].includes(platformExt) && opts.platform !== platformExt) {
      source = '';
    } else {
      source = `
        // UNIT-TEST-LOADER START
        try {
          console.log('Loading test: ${loadPath}');
          global.loadModule('${loadPath}');
        } catch(err) {
          console.log('Failed to load test ${loadPath}.', err)
          throw new Error('Failed to load test ${loadPath}.');
        }
        // UNIT-TEST-LOADER END
      `;
    }
  }

  this.callback(null, source, map);
};
