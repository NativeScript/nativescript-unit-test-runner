declare let require: any;

import { Application } from "@nativescript/core";
import "./app.css";
import { registerTestRunner } from "./services/webpack-test-runner";

const context = require.context("./", true, /.*\.(js|css|xml)/);
global.registerWebpackModules(context);

export interface RunTestAppOptions {
  runTests?: () => unknown;
}

export function runTestApp(options: RunTestAppOptions = {}) {
  if (options?.runTests) {
    registerTestRunner(() => {
      options.runTests();
    });
  }
  Application.run({ moduleName: "bundle-app-root" });
}
