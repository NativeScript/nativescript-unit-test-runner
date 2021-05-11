#!/bin/sh

npm pack

rm -rf test-app
ns create test-app --tsc
cd test-app

ns test init --framework jasmine

npm i ../nativescript-unit-test-runner-*.tgz --legacy-peer-deps
# todo: change...
npm i ~/Code/NativeScript/packages/webpack5/nativescript-webpack-5.0.0-dev.tgz --legacy-peer-deps

rm webpack.config.js
./node_modules/.bin/nativescript-webpack init

