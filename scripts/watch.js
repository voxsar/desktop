// Copyright (c) 2016-present Aura, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const { spawn } = require('child_process');
const path = require('path');

const electron = require('electron');
const webpack = require('webpack');

const mainConfig = require('../webpack.config.main.js');
const preloadConfig = require('../webpack.config.preload.js');
const rendererConfig = require('../webpack.config.renderer.js');

let electronProcess = null;

function startElectron() {
<<<<<<< HEAD
	if (electronProcess) {
		electronProcess.removeAllListeners();
	}

	const electronExe = path.join(
		__dirname,
		'..',
		'node_modules',
		'electron',
		'dist',
		'electron.exe'
	);

	electronProcess = spawn(
		electronExe,
		[path.resolve('dist')],
		{ stdio: 'inherit' }
	);
=======
    if (electronProcess) {
        electronProcess.removeAllListeners();
    }
    electronProcess = spawn(
        electron,
        [path.resolve('dist/')],
        {stdio: 'inherit'},
    );
>>>>>>> b473ba39bfc4a853bf658f05ad5d2155dad9fd14
}


function restartElectron() {
	if (electronProcess) {
		electronProcess.kill();
	}
	startElectron();
}

let hasStarted = false;
Promise.all([mainConfig, preloadConfig, rendererConfig].map((config) => {
	return new Promise((resolve) => {
		const compiler = webpack(config);
		compiler.watch({}, (err, stats) => {
			if (err) {
				console.error(err);
			}
			process.stdout.write(stats.toString({ colors: true }));
			process.stdout.write('\n');
			if (!stats.hasErrors() && hasStarted) {
				restartElectron();
			}
			resolve();
		});
	});
})).then(() => {
	startElectron();
	hasStarted = true;
});
