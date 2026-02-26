// Copyright (c) 2016-present Aura, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

'use strict';

const fs = require('fs');

const env = require('../../modules/environment');
const {asyncSleep} = require('../../modules/utils');

describe('config', function desc() {
	this.timeout(30000);

<<<<<<< HEAD
	beforeEach(async () => {
		env.createTestUserDataDir();
		env.cleanTestConfig();
	});

	afterEach(async () => {
		if (this.app) {
			try {
				await this.app.close();
				// eslint-disable-next-line no-empty
			} catch (err) { }
		}
		await env.clearElectronInstances();
	});
=======
    beforeEach(async () => {
        env.createTestUserDataDir();
        await asyncSleep(1000);
        env.cleanTestConfig();
        await asyncSleep(1000);
    });

    afterEach(async () => {
        if (this.app) {
            try {
                await this.app.close();
            // eslint-disable-next-line no-empty
            } catch (err) {}
        }
        await env.clearElectronInstances();
        await asyncSleep(1000);
    });
>>>>>>> b473ba39bfc4a853bf658f05ad5d2155dad9fd14

	describe('MM-T4401 should show servers in dropdown when there is config file', async () => {
		const config = env.demoConfig;

<<<<<<< HEAD
		beforeEach(async () => {
			fs.writeFileSync(env.configFilePath, JSON.stringify(config));
			this.app = await env.getApp();
		});

		afterEach(async () => {
			if (this.app) {
				try {
					await this.app.close();
					// eslint-disable-next-line no-empty
				} catch (err) { }
			}
		});
=======
        beforeEach(async () => {
            fs.writeFileSync(env.configFilePath, JSON.stringify(config));
            this.app = await env.getApp();
            await asyncSleep(1000);
        });

        afterEach(async () => {
            if (this.app) {
                try {
                    await this.app.close();
                // eslint-disable-next-line no-empty
                } catch (err) {}
            }
            await asyncSleep(1000);
        });
>>>>>>> b473ba39bfc4a853bf658f05ad5d2155dad9fd14

		it('MM-T4401_1 should show correct server in the dropdown button', async () => {
			const mainWindow = this.app.windows().find((window) => window.url().includes('index'));
			const dropdownButtonText = await mainWindow.innerText('.ServerDropdownButton');
			dropdownButtonText.should.equal('example');
		});

<<<<<<< HEAD
		it('MM-T4401_2 should set src of browser view from config file', async () => {
			this.serverMap = await env.getServerMap(this.app);
			const firstServer = this.serverMap[config.servers[0].name][0].win;
			const secondServer = this.serverMap[config.servers[1].name][0].win;

			firstServer.url().should.equal(config.servers[0].url);
			secondServer.url().should.equal(config.servers[1].url);
		});
	});

	it('MM-T4402 should upgrade v0 config file', async () => {
		const Config = require('src/common/config').Config;
		const newConfig = new Config(env.configFilePath);
		const oldConfig = {
			url: env.exampleURL,
		};
		fs.writeFileSync(env.configFilePath, JSON.stringify(oldConfig));
		this.app = await env.getApp();
		const mainWindow = this.app.windows().find((window) => window.url().includes('index'));
		const dropdownButtonText = await mainWindow.innerText('.ServerDropdownButton:has-text("Primary server")');
		dropdownButtonText.should.equal('Primary server');
=======
        it('MM-T4401_2 should set src of browser view from config file', async () => {
            this.serverMap = await env.getServerMap(this.app);
            const firstServer = this.serverMap[config.servers[0].name][0].win;
            const secondServer = this.serverMap[config.servers[1].name][0].win;
            await asyncSleep(1000);

            // Application automatically upgrades HTTP to HTTPS for security (see serverHub.ts:228-233)
            firstServer.url().should.equal('https://example.com/');
            secondServer.url().should.equal(config.servers[1].url);
        });
    });

    it('MM-T4402 should upgrade v0 config file', async () => {
        const Config = require('src/common/config').Config;
        const newConfig = new Config(env.configFilePath);
        const oldConfig = {
            url: env.exampleURL,
        };
        fs.writeFileSync(env.configFilePath, JSON.stringify(oldConfig));
        this.app = await env.getApp();
        await asyncSleep(2000);
        const mainWindow = this.app.windows().find((window) => window.url().includes('index'));
        const dropdownButtonText = await mainWindow.innerText('.ServerDropdownButton:has-text("Primary server")');
        dropdownButtonText.should.equal('Primary server');
>>>>>>> b473ba39bfc4a853bf658f05ad5d2155dad9fd14

		const str = fs.readFileSync(env.configFilePath, 'utf8');
		const upgradedConfig = JSON.parse(str);
		upgradedConfig.version.should.equal(newConfig.defaultData.version);
		await this.app.close();
	});
});
