// Copyright (c) 2016-present Aura, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
'use strict';

const fs = require('fs');

const robot = require('robotjs');

const env = require('../../modules/environment');
const { asyncSleep } = require('../../modules/utils');

describe('menu/view', function desc() {
<<<<<<< HEAD
	this.timeout(30000);
=======
    this.timeout(90000);
>>>>>>> b473ba39bfc4a853bf658f05ad5d2155dad9fd14

	const config = env.demoMattermostConfig;

<<<<<<< HEAD
	beforeEach(async () => {
		env.cleanDataDir();
		env.createTestUserDataDir();
		env.cleanTestConfig();
		fs.writeFileSync(env.configFilePath, JSON.stringify(config));
		fs.writeFileSync(env.boundsInfoPath, JSON.stringify({ x: 0, y: 0, width: 600, height: 240, maximized: false, fullscreen: false }));
		await asyncSleep(1000);
		this.app = await env.getApp();
		this.serverMap = await env.getServerMap(this.app);
	});
=======
    beforeEach(async () => {
        env.cleanDataDir();
        env.createTestUserDataDir();
        env.cleanTestConfig();
        fs.writeFileSync(env.configFilePath, JSON.stringify(config));
        fs.writeFileSync(env.boundsInfoPath, JSON.stringify({x: 0, y: 0, width: 800, height: 600, maximized: false, fullscreen: false}));
        await asyncSleep(1000);
        this.app = await env.getApp();
        this.serverMap = await env.getServerMap(this.app);
    });
>>>>>>> b473ba39bfc4a853bf658f05ad5d2155dad9fd14

	afterEach(async () => {
		if (this.app) {
			await this.app.close();
		}
		await env.clearElectronInstances();
	});

<<<<<<< HEAD
	// TODO: No keyboard shortcut for macOS
	if (process.platform !== 'darwin') {
		it('MM-T816 Toggle Full Screen in the Menu Bar', async () => {
			const mainWindow = this.app.windows().find((window) => window.url().includes('index'));
			const firstServer = this.serverMap[config.servers[0].name][0].win;
			await env.loginToMattermost(firstServer);
			await firstServer.waitForSelector('#post_textbox');
			let currentWidth = await firstServer.evaluate('window.outerWidth');
			let currentHeight = await firstServer.evaluate('window.outerHeight');
			await mainWindow.click('button.three-dot-menu');
			robot.keyTap('v');
			robot.keyTap('t');
			robot.keyTap('enter');
			await asyncSleep(1000);
			const fullScreenWidth = await firstServer.evaluate('window.outerWidth');
			const fullScreenHeight = await firstServer.evaluate('window.outerHeight');
			fullScreenWidth.should.be.greaterThan(currentWidth);
			fullScreenHeight.should.be.greaterThan(currentHeight);
			await mainWindow.click('button.three-dot-menu');
			robot.keyTap('v');
			robot.keyTap('t');
			robot.keyTap('enter');
			await asyncSleep(1000);
			currentWidth = await firstServer.evaluate('window.outerWidth');
			currentHeight = await firstServer.evaluate('window.outerHeight');
			currentWidth.should.be.lessThan(fullScreenWidth);
			currentHeight.should.be.lessThan(fullScreenHeight);
		});
	}
=======
    // TODO: No keyboard shortcut for macOS
    if (process.platform === 'win32') {
        it('MM-T816 Toggle Full Screen in the Menu Bar', async () => {
            const mainWindow = this.app.windows().find((window) => window.url().includes('index'));
            const firstServer = this.serverMap[config.servers[0].name][0].win;
            await env.loginToMattermost(firstServer);
            await firstServer.waitForSelector('#post_textbox');
            const currentWidth = await firstServer.evaluate('window.outerWidth');
            const currentHeight = await firstServer.evaluate('window.outerHeight');
            await mainWindow.click('button.three-dot-menu');
            robot.keyTap('v');
            robot.keyTap('t');
            robot.keyTap('enter');

            await asyncSleep(2000);

            const fullScreenWidth = await firstServer.evaluate('window.outerWidth');
            const fullScreenHeight = await firstServer.evaluate('window.outerHeight');
            fullScreenWidth.should.be.greaterThan(currentWidth);
            fullScreenHeight.should.be.greaterThan(currentHeight);
            await mainWindow.click('button.three-dot-menu');
            robot.keyTap('v');
            robot.keyTap('t');
            robot.keyTap('enter');

            await asyncSleep(2000);

            const exitWidth = await firstServer.evaluate('window.outerWidth');
            const exitHeight = await firstServer.evaluate('window.outerHeight');
            exitWidth.should.be.lessThan(fullScreenWidth);
            exitHeight.should.be.lessThan(fullScreenHeight);
        });
    }
>>>>>>> b473ba39bfc4a853bf658f05ad5d2155dad9fd14
});
