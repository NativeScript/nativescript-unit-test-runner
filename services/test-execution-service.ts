declare var global: any;

export class TestExecutionService implements ITestExecutionService {
    public runTests(scripts: IScriptInfo[]): ITestExecutionError[] {
        const errors = [];
        const testScripts = scripts.filter(script => script.type === ScriptTypes.FrameworkAdapterType || script.type === ScriptTypes.TestType);
        testScripts
            .forEach(script => {
                try {
                    this.runTest(script);
                } catch (err) {
                    errors.push({
                        msg: err.toString(),
                        url: script.localPath || script.url,
                        line: err.lineNumber || 0
                    });
                }
            });

        return errors;
    }

    private runTest(script: IScriptInfo): void {
        if (script.localPath) {
            console.log('NSUTR: require script ' + script.url + ' from ' + script.localPath);
            // Add this check in order to prevent the following warning from webpack compiler:
            // WARNING in ../node_modules/nativescript-unit-test-runner/main-view-model.js 204:28-53
            // Critical dependency: the request of a dependency is an expression
            if (!global.TNS_WEBPACK) {
                require(script.localPath);
            }
        } else {
            const queryStringStart = script.url.lastIndexOf('?');
            const pathWithoutQueryString = script.url.substring(0, queryStringStart);
            const extensionRegex = /\.([^.\/]+)$/;
            const fileExtension = extensionRegex.exec(pathWithoutQueryString)[1];

            if (!fileExtension || fileExtension.toLowerCase() === "js") {
                console.log('NSUTR: eval script ' + script.url);
                this.loadShim(script.url);
                //call eval indirectly to execute the scripts in the global scope
                var geval = eval;
                geval(script.contents);
                this.completeLoading(script.url);
            } else {
                console.log('NSUTR: ignoring evaluation of script ' + script.url);
            }
        }
    }

    private loadShim(url: string) {
        if (url.indexOf('mocha') !== -1) {
            global.window = global;
            global.location = { href: '/' };
            global.document = {
                getElementById: id => null
            }
        } else if (url.indexOf('chai') !== -1) {
            global.__shim_require = global.require;
            global.require = function () {
                throw Error();
            }
            global.window = global;
        } else if (url.indexOf('qunit.js') !== -1) {
            global.define = function (factory) {
                global.QUnit = factory();
            }
            global.define.amd = true;
        }
    }

    private completeLoading(url: string) {
        if (url.indexOf('mocha') !== -1) {
            delete global.window;
            // delete global.location;
            delete global.document;
        }
        if (url.indexOf('chai') !== -1) {
            delete global.window;
            global.require = global.__shim_require;
            delete global.__shim_require;
        } else if (url.indexOf('qunit.js') !== -1) {
            delete global.define;
        }
    }
}