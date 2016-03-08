"use strict";

import * as fs from "fs";
import * as path from "path";
import { EOL } from "os";
import * as hookHelper from "./lib/hook-helper";

let projectDir = hookHelper.findProjectDir();
if(projectDir) {
	let hooksDir = hookHelper.getHooksDir(),
		afterPrepareHookDir = hookHelper.getAfterPrepareHookDir(),
		content = 'module.exports = require("nativescript-unit-test-runner/lib/after-prepare");';
	if(!fs.existsSync(hooksDir)) {
		fs.mkdirSync(hooksDir);
	}

	if(!fs.existsSync(afterPrepareHookDir)) {
		fs.mkdirSync(afterPrepareHookDir);
	}

	fs.writeFileSync(hookHelper.getHookFilePath(), content + EOL);
}
