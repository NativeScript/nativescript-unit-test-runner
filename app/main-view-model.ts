/// <reference path="../declarations.d.ts"/>
import { Observable } from "@nativescript/core/data/observable";
import { ObservableArray } from "@nativescript/core/data/observable-array";
import * as http from "@nativescript/core/http";
import * as platform from "@nativescript/core/platform";
import * as frameModule from "@nativescript/core/ui/frame";
import { KarmaHostResolver } from "./services/karma-host-resolver";
import { KarmaFilesService } from "./services/karma-files-service";
import { TestExecutionService } from "./services/test-execution-service";
import { killProcess } from "./stop-process";

declare var global: any;

function enableSocketIoDebugging() {
    console.log("enabling socket.io debugging");

    global.localStorage = {
        debug: "*",
    };

    global.window = global;
}

var config: INetworkConfiguration = require("../config");
config.options = config.options || {};
if (!config.options.appDirectoryRelativePath) {
    config.options.appDirectoryRelativePath = "app";
}

var bundle = config.options && config.options.bundle;

export class TestBrokerViewModel extends Observable {
    private startEmitted: boolean;
    private executed: boolean;
    private hasError: boolean;
    private karmaRequestedRun: boolean;
    private baseUrl: string;
    private testResults: ObservableArray<any>;

    private socket: any; //socket.io socket
    private config: any; //karma config

    private karmaHostResolver: IKarmaHostResolver;
    private karmaFilesService: IKarmaFilesService;
    private testExecutionService: ITestExecutionService;

    constructor() {
        super();

        global.__karma__ = this;

        if (config.options.debugTransport) {
            enableSocketIoDebugging();
        }
        //debugger;

        this.testResults = new ObservableArray();
        this.updateView({
            testResults: this.testResults,
            serverInfo: "disconnected",
            imageSrc: this.getImageSrc(),
            goToTestsText: "Run Tests",
            isConnected: false,
            testsPassed: "-",
            testsFailed: "-",
            testsRan: 0,
            testsTotal: 0,
        });

        this.startEmitted = false;

        this.karmaHostResolver = new KarmaHostResolver(http);
        this.karmaFilesService = new KarmaFilesService(http, config);
        this.testExecutionService = new TestExecutionService();

        this.karmaHostResolver
            .resolveKarmaHost(config.ips, config.port)
            .then((hostIP) => {
                const serverInfo = hostIP
                    ? `found karma at ${hostIP}`
                    : "no reachable hosts";
                this.updateView({ serverInfo });
                this.connectToKarma(hostIP);
            })
            .catch((e) => console.log(e.toString()));
    }

    public viewTestRunDetails() {
        this.navigateTo("run-details");
    }

    public beginLocalRun() {
        this.config = this.config || { args: [] };
        this.navigateTo("test-run-page");
    }

    public onKarmaExecute(cfg) {
        this.karmaRequestedRun = true;
        this.config = cfg;

        this.beginLocalRun();
    }

    public executeTestRun() {
        if (this.executed) {
            console.log("NSUTR: disregarding second execution");
            return;
        }

        this.executed = true;
        this.startEmitted = false;
        this.hasError = false;

        this.set("goToTestsText", "View Test Run");

        this.karmaFilesService
            .getServedFilesData(this.baseUrl)
            .then((scriptsContents: IScriptInfo[]) =>
                setTimeout(() => this.runTests(scriptsContents), 0)
            );
    }

    public runTests(scripts: IScriptInfo[]): void {
        const errors = this.testExecutionService.runTests(scripts);
        errors.forEach((err) => this.error(err.msg, err.url, err.line));

        if (!this.hasError) {
            console.log("NSUTR: beginning test run");
            if (config.options.debugBrk) {
                /// HINT: If you need to place breakpoints in your tests, navigate to your test files in the Sources panel.
                /// Hit the 'Resume script execution' button or F8 to continue to your tests.
                debugger;
            }
            this.start(this.config);
        }
    }

    public start(cfg: any) {
        this.error(
            "You need to include a test adapter for the testing framework you're using"
        );
    }

    public info(data) {
        this.emitInfoToSocketIfNeeded(data);
        this.emitStartToSocketIfNeeded(data);

        this.updateView({
            testsRunning: true,
            testsPassed: 0,
            testsFailed: 0,
            testsRan: 0,
            testsTotal: data.total,
        });
    }

    public result(data) {
        this.emitStartToSocketIfNeeded({ total: null });
        this.emitToSocket("result", data);

        this.updateView({
            testsPassed: data.success ? this.get("testsPassed") + 1 : undefined,
            testsFailed: data.success ? undefined : this.get("testsFailed") + 1,
            testsRan: this.get("testsRan") + 1,
        });

        this.testResults.push(data);
    }

    public complete(data?: any) {
        console.log("NSUTR: completed test run.");
        this.set("testsRunning", false);

        delete this.start;

        this.emitToSocket("complete", data || {}, () => {
            console.log("NSUTR: completeAck");
            this.emitToSocket("disconnect");
            setTimeout(() => killProcess(), 500);
        });
    }

    public error(msg: string, url?: string, line?: number) {
        this.hasError = true;
        var fullMsg = url
            ? msg + "\nat " + url + (line ? ":" + line : "")
            : msg;
        console.log("NSUTR: this.error: " + fullMsg);
        this.result({
            id: url,
            description: `${url} at line ${line}` || "",
            log: [msg],
            time: 0,
            success: false,
            suite: [],
        });
        this.complete();
        return false;
    }

    private connectToKarma(hostIP: string) {
        if (!hostIP) {
            return;
        }

        this.baseUrl = `http://${hostIP}:${config.port}`;
        console.log(`NSUTR: connecting to karma at ${this.baseUrl}`);

        // shims for engine.io-parser
        global.navigator = {
            userAgent: "nativescript",
        };
        global.document = {
            documentElement: {
                style: {},
            },
        };

        this.updateView({ serverInfo: `connecting to ${this.baseUrl}` });
        let io = require("../socket.io");
        const socket = (this.socket = io.connect(this.baseUrl, {
            forceBase64: true,
        }));

        socket.on("connect", (err) => {
            console.log("NSUTR: successfully connected to karma");

            delete global.navigator;
            delete global.document;

            this.updateBanner("connected");
            this.updateView({ isConnected: true });

            socket.emit("register", {
                id: "NativeScriptUnit-" + (0 | (Math.random() * 10000)),
                name: `NativeScript / ${platform.Device.sdkVersion} (${platform.Device.osVersion}; ${platform.Device.model})`,
            });
        });

        this.attachOnServerSocketEvents(socket);
    }

    private attachOnServerSocketEvents(socket): void {
        socket.on("disconnect", this.updateBanner("disconnected"));
        socket.on("reconnecting", this.updateBanner("reconnecting in $ ms..."));
        socket.on("reconnect_failed", this.updateBanner("failed to reconnect"));
        socket.on("connect_failed", this.updateBanner("connection failed"));
        socket.on("reconnect", this.updateBanner("connected"));
        socket.on("connect_error", (data) =>
            console.log("NSUTR: socket.io error on connect: " + data)
        );
        socket.on("execute", this.onKarmaExecute.bind(this));
    }

    private emitToSocket(...args: any[]) {
        if (this.karmaRequestedRun) {
            this.socket.emit.apply(this.socket, arguments);
        }
    }

    private emitStartToSocketIfNeeded(data) {
        if (!this.startEmitted) {
            this.emitToSocket("start", data);
            this.startEmitted = true;
        }
    }

    private emitInfoToSocketIfNeeded(data) {
        if (this.startEmitted) {
            this.emitToSocket("info", data);
        }
    }

    private updateView(data): void {
        Object.keys(data).forEach((key) => {
            if (data[key] !== null && data[key] !== undefined) {
                this.set(key, data[key]);
            }
        });
    }

    private updateBanner(message: string): (err?: any) => void {
        return (err) => {
            this.updateView({ serverInfo: message });
            if (err) {
                console.log("NSUTR-socket.io: " + err.toString());
            }
        };
    }

    private navigateTo(pageName: string): void {
        const url = bundle
            ? pageName
            : `tns_modules/nativescript-unit-test-runner/${pageName}`;
        frameModule.getFrameById("root-frame").navigate(url);
    }

    private getImageSrc(): string {
        let result =
            "~/tns_modules/nativescript-unit-test-runner/nativescript.png";
        if (bundle) {
            result =
                "data:image/png;base64,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";
        }

        return result;
    }
}

export var mainViewModel = new TestBrokerViewModel();

require("@nativescript/core/application").onUncaughtError = (error) => {
    console.log("NSUTR: uncaught error");
    mainViewModel.error(error.message);
};
