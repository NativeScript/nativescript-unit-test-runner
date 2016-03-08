"use strict";

import * as fs from "fs";
import * as path from "path";

export function findProjectDir(){
	// start from the root of ns-unit-test-runner
	let candidateDir = path.join(__dirname, "..");

	while (true) {
		let oldCandidateDir = candidateDir;
		candidateDir = path.dirname(candidateDir);
		if (path.basename(candidateDir) === 'node_modules') {
			continue;
		}

		let packageJsonFile = path.join(candidateDir, 'package.json');
		if (fs.existsSync(packageJsonFile)) {
			return candidateDir;
		}

		if (oldCandidateDir === candidateDir) {
			return;
		}
	}
}

export function getHooksDir() {
	return path.join(findProjectDir(), 'hooks')
}

export function getAfterPrepareHookDir() {
	return path.join(getHooksDir(), "after-prepare");
}

export function getHookFilePath() {
	return path.join(getAfterPrepareHookDir(), "nativescript-unit-test-runner.js");
}
