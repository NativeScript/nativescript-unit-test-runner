interface String {
    startsWith(prefix: string): boolean;
}

// Same as module.exports
declare var exports: any;

declare function exit(exitCode: number): void;
declare module java {
    module lang {
        module System {
            function exit(exitCode: number): void;
        }
    }
}

