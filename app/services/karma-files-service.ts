export class KarmaFilesService {
    private extensionRegex = /\.([^.\/]+)$/;
    private appPrefix = null;
    private testsPrefix = null;
    private nodeModulesPrefix = null;
    private bundle = false;

    constructor(private http, config: IHostConfiguration) {
        this.appPrefix = `/base/${config.options.appDirectoryRelativePath}/`;
        this.testsPrefix = `/base/${config.options.appDirectoryRelativePath}/tests`;
        this.nodeModulesPrefix = `/base/node_modules/`;
        this.bundle = config.options.bundle;
    }

    public getServedFilesData(baseUrl: string): Promise<IScriptInfo[]> {
        const contextUrl = `${baseUrl}/context.json`;
        console.log("NSUTR: downloading " + contextUrl);
       
        const result = this.http.getString(contextUrl)
            .then(content => {
                var parsedContent: IKarmaContext = JSON.parse(content);
                return parsedContent.files;
            })
            .then(scriptUrls => {
                return Promise.all(scriptUrls.map((url): Promise<IScriptInfo> => {
                    const { extension, localPath, type } = this.getScriptData(url);
                    if (localPath) {
                        return Promise.resolve({
                            url,
                            type,
                            localPath,
                        });
                    } else {
                        return this.http.getString(baseUrl + url)
                            .then(contents => {
                                return {
                                    url,
                                    type,
                                    contents,
                                    shouldEval: !extension || extension.toLowerCase() === "js"
                                };
                            });
                    }
                }));
            });

        return result;
    }

    private getScriptData(url: string): { extension: string, localPath: string, type: ScriptTypes } {
        const queryStringStartIndex = url.lastIndexOf('?');
        const pathWithoutQueryString = url.substring(0, queryStringStartIndex);
        const extension = this.extensionRegex.exec(pathWithoutQueryString)[1];

        const type = this.getScriptType(url);

        let localPath = null;
        if (!this.bundle && url.startsWith(this.appPrefix)) {
            localPath = this.getScriptLocalPath(url, extension);
        }

        return { extension, localPath, type };
    }

    private getScriptType(url: string): ScriptTypes {
        let type = ScriptTypes.CodeUnderTestType;

        if (url.startsWith(this.testsPrefix)) {
            type = ScriptTypes.TestType;
        } else if (url.startsWith(this.nodeModulesPrefix)) {
            type = ScriptTypes.FrameworkAdapterType;
        }

        return type;
    }

    private getScriptLocalPath(url: string, scriptExtension: string): string {
        let localPath = null;
        const queryStringStartIndex = url.lastIndexOf('?');
        const relativePath = url.substring(this.appPrefix.length, queryStringStartIndex);
        localPath = '../../../' + relativePath;

        if (scriptExtension === "ts") {
            localPath = localPath.substring(0, localPath.length - 2) + "js";
        }

        return localPath;
    }
}