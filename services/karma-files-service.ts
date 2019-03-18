export class KarmaFilesService {
    constructor(private http) { }

    public getServedFilesData(baseUrl: string, config: IHostConfiguration): Promise<IScriptInfo[]> {
        const contextUrl = `${baseUrl}/context.json`;
        console.log("NSUTR: downloading " + contextUrl);
        const bundle = config && config.options && config.options.bundle;
        const result = this.http.getString(contextUrl)
            .then(content => {
                var parsedContent: IKarmaContext = JSON.parse(content);
                return parsedContent.files;
            })
            .then(scriptUrls => {
                return Promise.all(scriptUrls.map((url): Promise<IScriptInfo> => {
                    var appPrefix = `/base/${config.options.appDirectoryRelativePath}/`;
                    const type = this.getScriptType(url, config);
                    if (!bundle && url.startsWith(appPrefix)) {
                        var paramsStart = url.indexOf('?');
                        var relativePath = url.substring(appPrefix.length, paramsStart);
                        return Promise.resolve({
                            url,
                            type,
                            localPath: '../../../' + relativePath,
                        });
                    } else {
                        return this.http.getString(baseUrl + url)
                            .then(contents => {
                                return {
                                    url,
                                    type,
                                    contents
                                };
                            });
                    }
                }));
            });

        return result;
    }

    private getScriptType(url: string, config: IHostConfiguration): ScriptTypes {
        let type = ScriptTypes.CodeUnderTestType;

        if (url.startsWith(`/base/${config.options.appDirectoryRelativePath}/tests`)) {
            type = ScriptTypes.TestType;
        } else if (url.startsWith(`/base/node_modules/`)) {
            type = ScriptTypes.FrameworkAdapterType;
        }

        return type;
    }
}