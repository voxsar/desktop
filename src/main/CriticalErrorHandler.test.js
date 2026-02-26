// Copyright (c) 2016-present Aura, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
'use strict';

import { spawn } from 'child_process';
import path from 'path';

import { app, dialog } from 'electron';

<<<<<<< HEAD
import { CriticalErrorHandler } from './CriticalErrorHandler';
=======
import sentryHandler from 'main/sentryHandler';

import {CriticalErrorHandler} from './CriticalErrorHandler';
>>>>>>> b473ba39bfc4a853bf658f05ad5d2155dad9fd14

jest.mock('path', () => ({
	join: jest.fn().mockImplementation((...args) => args.join('/')),
}));

jest.mock('electron', () => ({
	app: {
		name: 'Mattermost',
		getVersion: () => '5.0.0',
		getPath: (folder) => `/${folder}`,
		relaunch: jest.fn(),
		isReady: jest.fn(),
		exit: jest.fn(),
	},
	dialog: {
		showMessageBox: jest.fn(),
	},
}));

jest.mock('fs', () => ({
	writeFileSync: jest.fn(),
}));

jest.mock('child_process', () => ({
	spawn: jest.fn(),
}));

jest.mock('main/i18nManager', () => ({
	localizeMessage: jest.fn(),
}));

jest.mock('main/sentryHandler', () => ({
<<<<<<< HEAD
	captureException: jest.fn(),
=======
    flush: jest.fn(),
>>>>>>> b473ba39bfc4a853bf658f05ad5d2155dad9fd14
}));

describe('main/CriticalErrorHandler', () => {
	const criticalErrorHandler = new CriticalErrorHandler();
	const env = process.env;

	describe('processUncaughtExceptionHandler', () => {
		beforeEach(() => {
			app.isReady.mockImplementation(() => true);
			process.env = { ...env, NODE_ENV: 'jest' };
		});

		afterAll(() => {
			process.env = env;
		});

		it('should throw error if app is not ready', () => {
			app.isReady.mockImplementation(() => false);
			expect(() => {
				criticalErrorHandler.processUncaughtExceptionHandler(new Error('test'));
			}).toThrow(Error);
			expect(dialog.showMessageBox).not.toBeCalled();
		});

		it('should open external file on Show Details', async () => {
			path.join.mockImplementation(() => 'testfile.txt');
			const promise = Promise.resolve({ response: process.platform === 'darwin' ? 2 : 0 });
			dialog.showMessageBox.mockImplementation(() => promise);
			criticalErrorHandler.processUncaughtExceptionHandler(new Error('test'));
			await promise;
			expect(spawn).toBeCalledWith(expect.any(String), expect.arrayContaining(['testfile.txt']), expect.any(Object));
		});

<<<<<<< HEAD
		it('should restart app on Reopen', async () => {
			path.join.mockImplementation(() => 'testfile.txt');
			const promise = Promise.resolve({ response: process.platform === 'darwin' ? 0 : 2 });
			dialog.showMessageBox.mockImplementation(() => promise);
			criticalErrorHandler.processUncaughtExceptionHandler(new Error('test'));
			await promise;
			expect(app.relaunch).toBeCalled();
		});
	});
=======
        it('should restart app on Reopen', async () => {
            path.join.mockImplementation(() => 'testfile.txt');
            const promise = Promise.resolve({response: process.platform === 'darwin' ? 0 : 2});
            dialog.showMessageBox.mockImplementation(() => promise);
            criticalErrorHandler.processUncaughtExceptionHandler(new Error('test'));
            await promise;
            expect(app.relaunch).toBeCalled();
        });

        it('should call sentryHandler.flush before app.exit when an exception happens', async () => {
            const callOrder = [];
            sentryHandler.flush.mockImplementation(() => {
                callOrder.push('flush');
                return Promise.resolve();
            });
            app.exit.mockImplementation(() => {
                callOrder.push('exit');
            });
            path.join.mockImplementation(() => 'testfile.txt');
            const promise = Promise.resolve({response: process.platform === 'darwin' ? 0 : 2});
            dialog.showMessageBox.mockImplementation(() => promise);
            criticalErrorHandler.processUncaughtExceptionHandler(new Error('test'));
            await promise;
            await new Promise((resolve) => setImmediate(resolve));
            expect(callOrder).toEqual(['flush', 'exit']);
        });
    });
>>>>>>> b473ba39bfc4a853bf658f05ad5d2155dad9fd14
});
