var now = new Date().toISOString();

function shallowCopy(obj) {
	var result = {};
	Object.keys(obj).forEach(function(key) {
		result[key] = obj[key];
	});
	return result;
}

var travisTag = process.env["TRAVIS_TAG"];

module.exports = function(grunt) {
	var path = require("path");

	grunt.loadNpmTasks("grunt-shell");

	grunt.registerTask("set_package_version", function(version) {
		version = version || travisTag;
		if (!version) {
			return;
		}

		var packageJson = grunt.file.readJSON("package.json");
		packageJson.version = version;
		grunt.file.write("package.json", JSON.stringify(packageJson, null, "  "));
	});

	grunt.registerTask("pack", [
		"set_package_version",
		"shell:build_package",
	]);

	grunt.registerTask("publish", function(versionTag) {
		grunt.config.set('versionTag', versionTag);
		grunt.task.run('shell:travis_publish');
	});

	grunt.initConfig({
		pkg: grunt.file.readJSON("package.json"),

		ts: {
			options: {
				passThrough: true,
				target: 'es5',
				module: 'commonjs',
				sourceMap: true,
				declaration: false,
				removeComments: false,
				noImplicitAny: false,
				experimentalDecorators: true,
				emitDecoratorMetadata: true,
				additionalFlags: "--noImplicitUseStrict"
			},

			devlib: {
				src: ["**/*.ts", "!node_modules/**/*.ts", "!declarations.d.ts"],
				reference: ".d.ts"
			},

			release_build: {
				src: ["**/*.ts", "!node_modules/**/*.ts", "test/**/*.ts"],
				reference: ".d.ts",
				options: {
					sourceMap: false,
					removeComments: true
				}
			}
		},

		shell: {
			options: {
				stdout: true,
				stderr: true,
				failOnError: true
			},

			build_package: {
				command: "npm pack",
			},

			travis_publish: {
				command: [
				'git tag -a <%= versionTag %> -m "nativescript-unit-test-runner v<%= versionTag %>" remotes/origin/master',
				'git push origin <%= versionTag %>'
				].join('&&')
			}
		},

		clean: {
			src: ["**/*.js*", "!**/*.json", "!Gruntfile.js", "!node_modules/**/*", "*.tgz"]
		}
	});

	grunt.loadNpmTasks("grunt-contrib-clean");
	grunt.loadNpmTasks("grunt-contrib-watch");
	grunt.loadNpmTasks("grunt-ts");

	grunt.registerTask("default", "ts:devlib");
	grunt.registerTask("prepare", [
		"clean",
		"ts:release_build",
		"shell:build_package",
	]);
};
