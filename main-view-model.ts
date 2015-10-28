/// <reference path="declarations.d.ts"/>

"use strict";

import observable = require("data/observable");
import observableArray = require('data/observable-array');
import http = require('http');
import platform = require('platform');
import frameModule = require('ui/frame');
import stopProcess = require('./stop-process');

interface IHostConfiguration {
    port: number;
    ips: string[];
    options: {
        debugBrk?: boolean;
        debugTransport?: boolean;
    }
}

interface INetworkConfiguration extends IHostConfiguration {
    reachableIp: string;
}

interface IKarmaContext {
    files: string[];
}

interface IScriptInfo {
    url: string;
    localPath?: string;
    contents?: string;
}

function enableSocketIoDebugging() {
    console.log('enabling socket.io debugging');

    global.localStorage = {
        debug: "*"
    };

    global.window = global;
}

var config: INetworkConfiguration = require('./config');
config.options = config.options || {}

export class TestBrokerViewModel extends observable.Observable {
    private startEmitted: boolean;
    private executed: boolean;
    private hasError: boolean;
    private karmaRequestedRun: boolean;
    private baseUrl: string;
    private testResults: observableArray.ObservableArray<any>;

    private socket: any; //socket.io socket
    private config: any; //karma config
    private networkConfig: INetworkConfiguration;

    constructor() {
        super();

        global.__karma__ = this;

        if (config.options.debugTransport) {
            enableSocketIoDebugging();
        }
        //debugger;

        this.testResults = new observableArray.ObservableArray();
        this.set('testResults', this.testResults);
        this.set('serverInfo', 'disconnected');
        this.set('goToTestsText', 'Run Tests');
        this.set('isConnected', false);
        this.set('testsPassed', '-');
        this.set('testsFailed', '-');
        this.set('testsRan', 0);
        this.set('testsTotal', 0);

        this.startEmitted = false;

        this.networkConfig = config;

        this.resolveKarmaHost()
            .then(() => {
                if (this.networkConfig.reachableIp) {
                    this.connectToKarma();
                }
            }).catch(e => console.log(e.toString()));
    }

    public resolveKarmaHost() {
        var successfulResolution = new Promise<string>((resolve, reject) => {
            var foundKarma = false;
            var resolvers = config.ips.map(ip => {
                var karmaClientUrl = 'http://' + ip + ':' + config.port + '/context.json';
                console.log('NSUTR: fetching ' + karmaClientUrl);
                return http.getString({
                    url: karmaClientUrl,
                    method: 'GET',
                    timeout: 3000,
                }).then(() => {
                        console.log('NSUTR: found karma at ' + ip);
                        if (!foundKarma) {
                            foundKarma = true;
                            resolve(ip);
                        }
                    }, () => undefined)
            });
            Promise.all(resolvers)
                .then(() => {
                    if (!foundKarma) {
                        resolve(null);
                    }
                })
        });

        return successfulResolution
            .then(result => {
                if (result) {
                    this.set('serverInfo', 'found karma at ' + result);
                    this.networkConfig.reachableIp = result;
                } else {
                    this.set('serverInfo', 'no reachable hosts');
                }
            });
    }

    private updateBanner(message: string): (err?: any) => void {
        return err => {
            this.set('serverInfo', message);
            if (err) {
                console.log('NSUTR-socket.io: ' + err.toString());
            }
        }
    }

    public connectToKarma() {
        this.baseUrl = 'http://' + this.networkConfig.reachableIp + ':' + this.networkConfig.port;
        console.log('NSUTR: connecting to karma at ' + this.baseUrl);

        // shims for engine.io-parser
        global.navigator = {
            userAgent: 'nativescript',
        };
        global.document = {
            documentElement: {
                style: {}
            }
        };

        var io = require('./socket.io');
        this.set('serverInfo', 'connecting to ' + this.baseUrl);
        var socket = this.socket = io.connect(this.baseUrl, {
            forceBase64: true
        });

        function formatName() {
            return `NativeScript / ${ platform.device.sdkVersion } (${ platform.device.osVersion }; ${ platform.device.model })`;
        }

        var connected = this.updateBanner('connected');

        socket.on('connect', err => {
            console.log('NSUTR: successfully connected to karma');

            delete global.navigator;
            delete global.document;

            connected();

            this.set('isConnected', true);

            socket.emit('register', {
                id: 'NativeScriptUnit-' + (0 | (Math.random() * 10000)),
                name: formatName(),
            });
        });
        socket.on('disconnect', this.updateBanner('disconnected'));
        socket.on('reconnecting', this.updateBanner('reconnecting in $ ms...'));
        socket.on('reconnect', connected);
        socket.on('reconnect_failed', this.updateBanner('failed to reconnect'));
        socket.on('info', this.updateBrowsersInfo.bind(this));
        socket.on('connect_failed', this.updateBanner('connection failed'));
        socket.on('disconnect', () => this.updateBrowsersInfo([]));

        socket.on('connect_error', data => console.log('NSUTR: socket.io error on connect: ' + data));

        socket.on('execute', this.onKarmaExecute.bind(this));
    }

    public viewTestRunDetails() {
        frameModule.topmost().navigate('run-details');
    }

    public beginLocalRun() {
        this.config = this.config || { args: [] };

        frameModule.topmost().navigate('tns_modules/nativescript-unit-test-runner/test-run-page');
    }

    public onKarmaExecute(cfg) {
        this.karmaRequestedRun = true;
        this.config = cfg;

        this.beginLocalRun();
    }

    public executeTestRun() {
        if (this.executed) {
            console.log('NSUTR: disregarding second execution');
            return;
        }
        this.executed = true;

        this.set('goToTestsText', 'View Test Run');

        this.startEmitted = false;
        this.hasError = false;
        var contextUrl = this.baseUrl + '/context.json';
        console.log("NSUTR: downloading " + contextUrl);
        http.getString(contextUrl)
            .then(content => {
                var parsedContent: IKarmaContext = JSON.parse(content);
                return parsedContent.files;
            })
            .then(scriptUrls => {
                return Promise.all(scriptUrls.map((url): Promise<IScriptInfo> => {
                    var appPrefix = '/base/app/';
                    if (url.startsWith(appPrefix)) {
                        var paramsStart = url.indexOf('?');
                        var relativePath = url.substring(appPrefix.length, paramsStart);
                        return Promise.resolve({
                            url: url,
                            localPath: '../../' + relativePath,
                        });
                    } else {
                        return http.getString(this.baseUrl + url)
                            .then(contents => {
                                return {
                                    url: url,
                                    contents: contents,
                                };
                            });
                    }
                }));
            })
            .then((scriptsContents: IScriptInfo[]) => setTimeout(() => this.runTests(scriptsContents), 0));
    }

    public runTests(testScripts: IScriptInfo[]): void {
        testScripts
            .filter(script => this.isTestScript(script.url))
            .forEach(script => {
                try {
                    if (script.localPath) {
                        console.log('NSUTR: require script ' + script.url + ' from ' + script.localPath);
                        require(script.localPath);
                    } else {
                        console.log('NSUTR: eval script ' + script.url);
                        this.loadShim(script.url);
                        //call eval indirectly to execute the scripts in the global scope
                        var geval = eval;
                        geval(script.contents);
                        this.completeLoading(script.url);
                    }
                } catch (err) {
                    this.error(err.toString(), script.localPath || script.url, err.lineNumber || 0);
                }
            });
        if (!this.hasError) {
            console.log('NSUTR: beginning test run');
            if (config.options.debugBrk) {
                /// HINT: If you need to place breakpoints in your tests, navigate to your test files in the Sources panel.
                /// Hit the 'Resume script execution' button or F8 to continue to your tests.
                debugger;
            }
            this.start(this.config);
        }
    }

    private isTestScript(url: string): boolean {
        return url.startsWith('/base/app/tests/') || !url.startsWith('/base/app/');
    }

    public updateBrowsersInfo(browsers) {
    }

    public start(cfg: any) {
        this.error("You need to include a test adapter for the testing framework you're using");
    }

    public info(data) {
        if (!this.startEmitted) {
            this.socketEmit('start', data);
            this.startEmitted = true;
        } else {
            this.socketEmit('info', data);
        }

        this.set('testsRunning', true);
        this.set('testsPassed', 0);
        this.set('testsFailed', 0);
        this.set('testsRan', 0);
        this.set('testsTotal', data.total);
    }

    public result(data) {
        if (!this.startEmitted) {
            this.socketEmit('start', { total: null });
            this.startEmitted = true;
        }

        this.socketEmit('result', data);

        var countVar = data.success ? 'testsPassed' : 'testsFailed';
        this.set(countVar, this.get(countVar) + 1);
        this.set('testsRan', this.get('testsRan') + 1);

        this.testResults.push(data);
    }

    public complete(data?: any) {
        console.log("NSUTR: completed test run.");
        this.set('testsRunning', false);

        delete this.start;

        this.socketEmit('complete', data || {}, () => {
            console.log('NSUTR: completeAck');
            this.socketEmit('disconnect');
            setTimeout(() => stopProcess(), 500);
        });
    }

    public error(msg: string, url?: string, line?: number) {
        this.hasError = true;
        var fullMsg = url ? msg + '\nat ' + url + (line ? ':' + line : '') : msg;
        console.log("NSUTR: this.error: " + fullMsg);
        this.result({
            id: url,
            description: `${url} at line ${line}` || "",
            log: [msg],
            time: 0,
            success: false,
            suite: [],
        })
        this.complete();
        return false;
    }

    public socketEmit(...args: any[]) {
        if (this.karmaRequestedRun) {
            this.socket.emit.apply(this.socket, arguments);
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
            global.require = function() {
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
            //delete global.location;
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

export var mainViewModel = new TestBrokerViewModel();

require('application').onUncaughtError = error => {
    console.log("NSUTR: uncaught error");
    mainViewModel.error(error.message);
}
