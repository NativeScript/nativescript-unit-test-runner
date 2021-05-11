declare let require: any;

import { Application } from "@nativescript/core";
import "./app.css"

const context = require.context('./', true, /.*\.(js|css|xml)/)
global.registerWebpackModules(context);

Application.run({ moduleName: "bundle-app-root" });
