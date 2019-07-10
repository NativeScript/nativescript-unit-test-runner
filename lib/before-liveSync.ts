module.exports = function ($staticConfig, $errors, hookArgs) {
    var majorVersionMatch = ($staticConfig.version || '').match(/^(\d+)\./);
    var majorVersion = majorVersionMatch && majorVersionMatch[1] && +majorVersionMatch[1];
    if (majorVersion && majorVersion < 6) {
        var isUsingBundleWorkflow = hookArgs &&
            hookArgs.liveSyncData &&
            hookArgs.liveSyncData.bundle;
        if (isUsingBundleWorkflow) {
            var packageJsonData = require("../package.json");
            throw new Error("The current version of " + packageJsonData.name + " (" + packageJsonData.version + ") is not compatible with the used CLI: " + $staticConfig.version + ". Please upgrade your NativeScript CLI version (npm i -g nativescript).");
        }
    }
};
