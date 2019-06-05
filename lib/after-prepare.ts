import * as path from "path";
import * as fs from "fs";

function isCLIVersionLowerThan6($injector) {
    try {
        const $staticConfig = $injector.resolve('$staticConfig');
        const version = $staticConfig && $staticConfig.version;
        const majorVersion = (version || '').split('.')[0];
        return !majorVersion || +majorVersion < 6;
    } catch (err) {
        return false;
    }
}

module.exports = function (hookArgs, $injector, $testExecutionService) {
	if (isCLIVersionLowerThan6($injector)) {
		const bundle = hookArgs && hookArgs.appFilesUpdaterOptions && hookArgs.appFilesUpdaterOptions.bundle;
		if($testExecutionService && $testExecutionService.platform && !bundle) {
			const $platformsData = $injector.resolve("platformsData");
			let platformData = $platformsData.getPlatformData($testExecutionService.platform),
				projectFilesPath = path.join(platformData.appDestinationDirectoryPath, "app"),
				packageJsonPath = path.join(projectFilesPath, 'package.json'),
				packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());

			// When test command is used in ns-cli, we should change the entry point of the application
			packageJson.main = "./tns_modules/nativescript-unit-test-runner/app.js";
			fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson));
		}
	}
}