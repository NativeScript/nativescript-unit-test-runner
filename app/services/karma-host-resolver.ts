export class KarmaHostResolver implements IKarmaHostResolver {
    constructor(private http) { }

    public resolveKarmaHost(ips: string[], port: number): Promise<string> {
        const result = new Promise<string>(resolve => {
            var foundKarma = false;
            var resolvers = ips.map(ip => {
                var karmaClientUrl = `http://${ip}:${port}/context.json`;
                console.log('NSUTR: fetching ' + karmaClientUrl);
                return this.http.getString({
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

        return result;
    }
}