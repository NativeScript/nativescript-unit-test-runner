import * as path from "path";
import * as fs from "fs";

module.exports = function (hookArgs, $platformsData, $testExecutionService) {
	const bundle = hookArgs && hookArgs.appFilesUpdaterOptions && hookArgs.appFilesUpdaterOptions.bundle;
	if($testExecutionService && $testExecutionService.platform && !bundle) {
		let platformData = $platformsData.getPlatformData($testExecutionService.platform),
			projectFilesPath = path.join(platformData.appDestinationDirectoryPath, "app"),
			packageJsonPath = path.join(projectFilesPath, 'package.json'),
			packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());

		// When test command is used in ns-cli, we should change the entry point of the application
		packageJson.main = "./tns_modules/nativescript-unit-test-runner/app.js";
		fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson));
	}
}
