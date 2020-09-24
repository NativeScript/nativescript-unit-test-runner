declare const enum ScriptTypes {
    TestType, // from tests folder
    CodeUnderTestType, // from app folder
    FrameworkAdapterType // from node_modules
}

interface String {
    startsWith(prefix: string): boolean;
}

// Same as module.exports
declare var exports: any;

declare function exit(exitCode: number): void;

interface IHostConfiguration {
    port: number;
    ips: string[];
    options: {
        debugBrk?: boolean;
        debugTransport?: boolean;
        bundle?: boolean;
        appDirectoryRelativePath?: string;
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
    type?: ScriptTypes;
    shouldEval?: boolean;
}

interface IKarmaHostResolver {
    resolveKarmaHost(ips: string[], port: number): Promise<string>;
}

interface IKarmaConnectionService {
    connect(baseUrl: string): Promise<void>;
}

interface IKarmaFilesService {
    getServedFilesData(baseUrl: string): Promise<IScriptInfo[]>;
}

interface ITestExecutionService {
    runTests(scripts: IScriptInfo[]): ITestExecutionError[];
}

interface ITestExecutionError {
    msg: string;
    url: string;
    line: number;
}