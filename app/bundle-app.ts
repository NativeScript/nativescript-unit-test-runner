declare let require: any, global: any;

import { Application } from "@nativescript/core";
import "./app.css";

const context = require.context("./", true, /.*\.(js|css|xml)/);
if (typeof global.registerWebpackModules !== "undefined") {
  global.registerWebpackModules(context);
} else {
  global.registerBundlerModules(context);
}

Application.run({ moduleName: "bundle-app-root" });
