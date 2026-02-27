// Copyright (c) 2016-present Aura, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-undef */

// Mock electron before any other modules to ensure it's available at import time
jest.mock('electron', () => ({
	app: {
		getPath: jest.fn((pathName) => {
			const paths = {
				appData: '/fake/app/data',
				userData: '/fake/user/data',
				downloads: '/fake/downloads',
				temp: '/fake/temp',
				home: '/fake/home',
				logs: '/fake/logs',
			};
			return paths[pathName] || `/fake/${pathName}`;
		}),
		getAppPath: jest.fn(() => '/fake/app/path'),
		getName: jest.fn(() => 'test-app'),
		getVersion: jest.fn(() => '1.0.0'),
		getLocale: jest.fn(() => 'en'),
		getLocaleCountryCode: jest.fn(() => 'US'),
		isReady: jest.fn(() => true),
		whenReady: jest.fn(() => Promise.resolve()),
		on: jest.fn(),
		once: jest.fn(),
		emit: jest.fn(),
		removeListener: jest.fn(),
		setPath: jest.fn(),
		setAppUserModelId: jest.fn(),
		setAsDefaultProtocolClient: jest.fn(),
		requestSingleInstanceLock: jest.fn(() => true),
		disableHardwareAcceleration: jest.fn(),
		enableSandbox: jest.fn(),
		quit: jest.fn(),
		exit: jest.fn(),
		relaunch: jest.fn(),
		focus: jest.fn(),
		hide: jest.fn(),
		show: jest.fn(),
		dock: {
			show: jest.fn(),
			hide: jest.fn(),
			setMenu: jest.fn(),
			setBadge: jest.fn(),
		},
		name: 'test-app',
	},
	ipcMain: {
		on: jest.fn(),
		once: jest.fn(),
		emit: jest.fn(),
		handle: jest.fn(),
		handleOnce: jest.fn(),
		removeHandler: jest.fn(),
		removeListener: jest.fn(),
		removeAllListeners: jest.fn(),
	},
	ipcRenderer: {
		on: jest.fn(),
		once: jest.fn(),
		send: jest.fn(),
		invoke: jest.fn(),
		sendSync: jest.fn(),
		removeListener: jest.fn(),
		removeAllListeners: jest.fn(),
	},
	BrowserWindow: jest.fn(),
	dialog: {
		showMessageBox: jest.fn(),
		showOpenDialog: jest.fn(),
		showSaveDialog: jest.fn(),
		showErrorBox: jest.fn(),
		showCertificateTrustDialog: jest.fn(),
	},
	Menu: {
		buildFromTemplate: jest.fn(),
		setApplicationMenu: jest.fn(),
		getApplicationMenu: jest.fn(),
	},
	Notification: jest.fn(),
	nativeImage: {
		createFromPath: jest.fn(),
		createFromBuffer: jest.fn(),
		createFromDataURL: jest.fn(),
	},
	shell: {
		openExternal: jest.fn(),
		openPath: jest.fn(),
		showItemInFolder: jest.fn(),
		beep: jest.fn(),
	},
	session: {
		defaultSession: {
			webRequest: {
				onBeforeRequest: jest.fn(),
				onHeadersReceived: jest.fn(),
			},
			cookies: {
				get: jest.fn(),
				set: jest.fn(),
				remove: jest.fn(),
			},
			clearCache: jest.fn(),
			clearStorageData: jest.fn(),
		},
		fromPartition: jest.fn(),
	},
	clipboard: {
		writeText: jest.fn(),
		readText: jest.fn(),
	},
	crashReporter: {
		start: jest.fn(),
	},
	screen: {
		getPrimaryDisplay: jest.fn(() => ({
			workArea: {x: 0, y: 0, width: 1920, height: 1080},
			bounds: {x: 0, y: 0, width: 1920, height: 1080},
		})),
		getAllDisplays: jest.fn(() => []),
		getCursorScreenPoint: jest.fn(() => ({x: 0, y: 0})),
	},
	webContents: {
		getAllWebContents: jest.fn(() => []),
	},
	systemPreferences: {
		getMediaAccessStatus: jest.fn(() => 'granted'),
		askForMediaAccess: jest.fn(() => Promise.resolve(true)),
	},
}));

// Mock electron-updater to avoid native module issues
jest.mock('electron-updater', () => ({
	autoUpdater: {
		checkForUpdates: jest.fn(),
		downloadUpdate: jest.fn(),
		quitAndInstall: jest.fn(),
		on: jest.fn(),
		removeListener: jest.fn(),
		setFeedURL: jest.fn(),
		getFeedURL: jest.fn(),
		checkForUpdatesAndNotify: jest.fn(),
	},
	CancellationToken: jest.fn(),
}));

jest.mock('main/constants', () => ({
	configPath: 'configPath',
	allowedProtocolFile: 'allowedProtocolFile',
	appVersionJson: 'appVersionJson',
	certificateStorePath: 'certificateStorePath',
	trustedOriginsStoreFile: 'trustedOriginsStoreFile',
	boundsInfoPath: 'boundsInfoPath',
	secureStoragePath: 'securePath',

	updatePaths: jest.fn(),
}));

jest.mock('common/log', () => {
	const logLevelsFn = {
		error: jest.fn(),
		warn: jest.fn(),
		info: jest.fn(),
		verbose: jest.fn(),
		debug: jest.fn(),
		silly: jest.fn(),
	};
	return {
		Logger: jest.fn().mockImplementation(() => ({
			...logLevelsFn,
			withPrefix: () => ({
				...logLevelsFn,
			}),
		})),
		setLoggingLevel: jest.fn(),
		getLevel: jest.fn(),
	};
});

