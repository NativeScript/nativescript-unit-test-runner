"use strict";

import * as fs from "fs";
import * as hookHelper from "./lib/hook-helper";

let hookPath = hookHelper.getHookFilePath();

if (fs.existsSync(hookPath)) {
	fs.unlinkSync(hookPath);
}
