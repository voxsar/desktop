// Copyright (c) 2016-present Aura, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { type BrowserWindow, WebContentsView, app, ipcMain } from 'electron';
import type { WebContentsViewConstructorOptions, Event } from 'electron/main';
import type { Options } from 'electron-context-menu';
import { EventEmitter } from 'events';
import semver from 'semver';

import NavigationManager from 'app/navigationManager';
import AppState from 'common/appState';
import {
	LOAD_RETRY,
	LOAD_SUCCESS,
	LOAD_FAILED,
	UPDATE_TARGET_URL,
	LOADSCREEN_END,
	BROWSER_HISTORY_STATUS_UPDATED,
	CLOSE_SERVERS_DROPDOWN,
	CLOSE_DOWNLOADS_DROPDOWN,
	LOAD_INCOMPATIBLE_SERVER,
	SERVER_URL_CHANGED,
	BROWSER_HISTORY_PUSH,
	RELOAD_VIEW,
} from 'common/communication';
import type { Logger } from 'common/log';
import MainWindow from 'app/mainWindow/mainWindow';
import ServerManager from 'common/servers/serverManager';
import { RELOAD_INTERVAL, MAX_SERVER_RETRIES, SECOND, MAX_LOADING_SCREEN_SECONDS } from 'common/utils/constants';
import { isInternalURL, parseURL } from 'common/utils/url';
import { type MattermostView } from 'common/views/MattermostView';
import ViewManager from 'common/views/viewManager';
import { updateServerInfos } from 'main/app/utils';
import DeveloperMode from 'main/developerMode';
import { localizeMessage } from 'main/i18nManager';
import performanceMonitor from 'main/performanceMonitor';
import { getServerAPI } from 'main/server/serverAPI';

import WebContentsEventManager from './webContentEvents';

import ContextMenu from '../../main/contextMenu';
import { getWindowBoundaries, getLocalPreload, composeUserAgent } from '../../main/utils';

enum Status {
	LOADING,
	READY,
	WAITING_MM,
	ERROR = -1,
}
export class MattermostWebContentsView extends EventEmitter {
	private view: MattermostView;
	private parentWindow: BrowserWindow;

	private log: Logger;
	private webContentsView: WebContentsView;
	private atRoot: boolean;
	private options: WebContentsViewConstructorOptions;
	private removeLoading?: NodeJS.Timeout;
	private contextMenu?: ContextMenu;
	private status?: Status;
	private retryLoad?: NodeJS.Timeout;
	private maxRetries: number;
	private altPressStatus: boolean;
	private lastPath?: string;

	constructor(view: MattermostView, options: WebContentsViewConstructorOptions, parentWindow: BrowserWindow) {
		super();
		this.view = view;
		this.parentWindow = parentWindow;

		const preload = getLocalPreload('externalAPI.js');
		this.options = Object.assign({}, options);
		this.options.webPreferences = {
			preload: DeveloperMode.get('browserOnly') ? undefined : preload,
			additionalArguments: [
				`version=${app.getVersion()}`,
				`appName=${app.name}`,
			],
			...options.webPreferences,
		};
		this.atRoot = true;
		this.webContentsView = new WebContentsView(this.options);
		this.resetLoadingStatus();

		this.log = ViewManager.getViewLog(this.id, 'MattermostWebContentsView');
		this.log.verbose('View created', this.id, this.view.title);

		this.webContentsView.webContents.on('update-target-url', this.handleUpdateTarget);
		this.webContentsView.webContents.on('input-event', (_, inputEvent) => {
			if (inputEvent.type === 'mouseDown') {
				ipcMain.emit(CLOSE_SERVERS_DROPDOWN);
				ipcMain.emit(CLOSE_DOWNLOADS_DROPDOWN);
			}
		});
		this.webContentsView.webContents.on('did-navigate-in-page', () => {
			this.handlePageTitleUpdated(this.webContentsView.webContents.getTitle());
			this.injectWindowControls();
		});
		this.webContentsView.webContents.on('did-navigate', () => {
			this.injectWindowControls();
		});
		this.webContentsView.webContents.on('dom-ready', () => {
			this.injectWindowControls();
		});
		this.webContentsView.webContents.on('page-title-updated', (_, newTitle) => this.handlePageTitleUpdated(newTitle));

		if (!DeveloperMode.get('disableContextMenu')) {
			this.contextMenu = new ContextMenu(this.generateContextMenu(), this.webContentsView.webContents);
		}
		this.maxRetries = MAX_SERVER_RETRIES;

		this.altPressStatus = false;

		this.parentWindow.on('blur', this.handleAltBlur);

		ServerManager.on(SERVER_URL_CHANGED, this.handleServerWasModified);
	}

	get id() {
		return this.view.id;
	}
	get serverId() {
		return this.view.serverId;
	}
	get parentViewId() {
		return this.view.parentViewId;
	}
	get isAtRoot() {
		return this.atRoot;
	}
	get currentURL() {
		return parseURL(this.webContentsView.webContents.getURL());
	}
	get webContentsId() {
		return this.webContentsView.webContents.id;
	}

	getWebContentsView = () => {
		return this.webContentsView;
	};

	goToOffset = (offset: number) => {
		if (this.webContentsView.webContents.navigationHistory.canGoToOffset(offset)) {
			try {
				this.webContentsView.webContents.navigationHistory.goToOffset(offset);
				this.updateHistoryButton();
			} catch (error) {
				this.log.error(error);
				this.reload();
			}
		}
	};

	getBrowserHistoryStatus = () => {
		if (this.currentURL?.toString() === this.view.getLoadingURL()?.toString()) {
			this.webContentsView.webContents.navigationHistory.clear();
			this.atRoot = true;
		} else {
			this.atRoot = false;
		}

		return {
			canGoBack: this.webContentsView.webContents.navigationHistory.canGoBack(),
			canGoForward: this.webContentsView.webContents.navigationHistory.canGoForward(),
		};
	};

	updateHistoryButton = () => {
		const { canGoBack, canGoForward } = this.getBrowserHistoryStatus();
		this.webContentsView.webContents.send(BROWSER_HISTORY_STATUS_UPDATED, canGoBack, canGoForward);
	};

	load = (someURL?: URL | string) => {
		if (!this.webContentsView) {
			return;
		}

		let loadURL: string;
		if (someURL) {
			const parsedURL = parseURL(someURL);
			if (parsedURL) {
				loadURL = parsedURL.toString();
			} else {
				this.log.error('Cannot parse provided url, using current server url');
				loadURL = this.view.getLoadingURL()?.toString() || '';
			}
		} else {
			loadURL = this.view.getLoadingURL()?.toString() || '';
		}
		this.log.verbose('Loading URL');
		performanceMonitor.registerServerView(`Server ${this.webContentsView.webContents.id}`, this.webContentsView.webContents, this.view.serverId);
		const loading = this.webContentsView.webContents.loadURL(loadURL, { userAgent: composeUserAgent(DeveloperMode.get('browserOnly')) });
		loading.then(this.loadSuccess(loadURL)).catch((err) => {
			if (err.code && err.code.startsWith('ERR_CERT')) {
				this.parentWindow.webContents.send(LOAD_FAILED, this.id, err.toString(), loadURL.toString());
				this.emit(LOAD_FAILED, this.id, err.toString(), loadURL.toString());
				this.log.info(`Invalid certificate, stop retrying until the user decides what to do: ${err}.`);
				this.status = Status.ERROR;
				return;
			}
			if (err.code && err.code.startsWith('ERR_ABORTED')) {
				// If the loading was aborted, we shouldn't be retrying
				return;
			}
			if (err.code && err.code.startsWith('ERR_BLOCKED_BY_CLIENT')) {
				// If the loading was blocked by the client, we should immediately retry
				this.load(loadURL);
				return;
			}
			this.loadRetry(loadURL, err);
		});
	};

	reload = (loadURL?: URL | string) => {
		this.resetLoadingStatus();
		AppState.updateExpired(this.serverId, false);
		this.emit(RELOAD_VIEW, this.id, loadURL);
		this.load(loadURL);
	};

	getBounds = () => {
		return this.webContentsView.getBounds();
	};

	openFind = () => {
		this.webContentsView.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F', modifiers: [process.platform === 'darwin' ? 'cmd' : 'ctrl', 'shift'] });
	};

	setBounds = (boundaries: Electron.Rectangle) => {
		this.webContentsView.setBounds(boundaries);
	};

	destroy = () => {
		WebContentsEventManager.removeWebContentsListeners(this.webContentsId);
		AppState.clear(this.id);
		performanceMonitor.unregisterView(this.webContentsView.webContents.id);
		if (this.parentWindow) {
			this.parentWindow.contentView.removeChildView(this.webContentsView);
		}
		if (this.contextMenu) {
			this.contextMenu.dispose();
		}
		this.webContentsView.webContents.close();

		if (this.retryLoad) {
			clearTimeout(this.retryLoad);
		}
		if (this.removeLoading) {
			clearTimeout(this.removeLoading);
		}
	};

	updateParentWindow = (window: BrowserWindow) => {
		this.parentWindow.off('blur', this.handleAltBlur);
		this.parentWindow = window;
		this.parentWindow.on('blur', this.handleAltBlur);
	};

	/**
	 * Status hooks
	 */

	resetLoadingStatus = () => {
		if (this.status !== Status.LOADING) { // if it's already loading, don't touch anything
			clearTimeout(this.retryLoad);
			delete this.retryLoad;
			this.status = Status.LOADING;
			this.maxRetries = MAX_SERVER_RETRIES;
		}
	};

	isReady = () => {
		return this.status === Status.READY;
	};

	isErrored = () => {
		return this.status === Status.ERROR;
	};

	needsLoadingScreen = () => {
		return !(this.status === Status.READY || this.status === Status.ERROR);
	};

	setInitialized = (timedout?: boolean) => {
		this.status = Status.READY;
		this.emit(LOADSCREEN_END, this.id);

		if (timedout) {
			this.log.verbose('timeout expired will show the browserview');
		}
		clearTimeout(this.removeLoading);
		delete this.removeLoading;
	};

	setLastPath = (path: string) => {
		this.lastPath = path;
	};

	useLastPath = () => {
		if (this.lastPath) {
			if (ViewManager.isPrimaryView(this.view.id)) {
				this.webContentsView.webContents.send(BROWSER_HISTORY_PUSH, this.lastPath);
			} else {
				this.webContentsView.webContents.once('did-finish-load', () => {
					this.webContentsView.webContents.send(BROWSER_HISTORY_PUSH, this.lastPath);
				});
				this.webContentsView.webContents.reload();
			}
			this.lastPath = undefined;
		}
	};

	openDevTools = () => {
		// Workaround for a bug with our Dev Tools on Mac
		// For some reason if you open two Dev Tools windows and close the first one, it won't register the closing
		// So what we do here is check to see if it's opened correctly and if not we reset it
		if (process.platform === 'darwin') {
			const timeout = setTimeout(() => {
				if (this.webContentsView.webContents.isDevToolsOpened()) {
					this.webContentsView.webContents.closeDevTools();
					this.webContentsView.webContents.openDevTools({ mode: 'detach' });
				}
			}, 500);
			this.webContentsView.webContents.on('devtools-opened', () => {
				clearTimeout(timeout);
			});
		}

		this.webContentsView.webContents.openDevTools({ mode: 'detach' });
	};

	/**
	 * WebContents hooks
	 */

	sendToRenderer = (channel: string, ...args: any[]) => {
		this.webContentsView.webContents.send(channel, ...args);
	};

	isDestroyed = () => {
		return this.webContentsView.webContents.isDestroyed();
	};

	focus = () => {
		if (this.parentWindow.isFocused()) {
			this.webContentsView.webContents.focus();
		}
	};

	/**
	 * ALT key handling for the 3-dot menu (Windows/Linux)
	 */

	/**
	 * Loading/retry logic
	 */

	private retry = (loadURL: string) => {
		return () => {
			// window was closed while retrying
			if (!this.webContentsView || !this.webContentsView.webContents || this.isDestroyed()) {
				return;
			}
			const loading = this.webContentsView.webContents.loadURL(loadURL, { userAgent: composeUserAgent(DeveloperMode.get('browserOnly')) });
			loading.then(this.loadSuccess(loadURL)).catch((err) => {
				if (this.maxRetries-- > 0) {
					this.loadRetry(loadURL, err);
				} else {
					this.parentWindow.webContents.send(LOAD_FAILED, this.id, err.toString(), loadURL.toString());
					this.emit(LOAD_FAILED, this.id, err.toString(), loadURL.toString());
					this.log.info('Could not establish a connection, will continue to retry in the background', { err });
					this.status = Status.ERROR;
					this.retryLoad = setTimeout(this.retryInBackground(loadURL), RELOAD_INTERVAL);
				}
			});
		};
	};

	private retryInBackground = (loadURL: string) => {
		return () => {
			// window was closed while retrying
			if (!this.webContentsView || !this.webContentsView.webContents) {
				return;
			}
			const parsedURL = parseURL(loadURL);
			if (!parsedURL) {
				return;
			}
			const server = ServerManager.getServer(this.view.serverId);
			if (!server) {
				return;
			}
			getServerAPI(
				parsedURL,
				false,
				async () => {
					await updateServerInfos([server]);
					this.reload(loadURL);
				},
				() => { },
				(error: Error) => {
					this.log.debug(`Cannot reach server: ${error}`);
					this.retryLoad = setTimeout(this.retryInBackground(loadURL), RELOAD_INTERVAL);
				});
		};
	};

	private loadRetry = (loadURL: string, err: Error) => {
		if (this.isDestroyed()) {
			return;
		}
		this.retryLoad = setTimeout(this.retry(loadURL), RELOAD_INTERVAL);
		this.parentWindow.webContents.send(LOAD_RETRY, this.id, Date.now() + RELOAD_INTERVAL, err.toString(), loadURL.toString());
		this.log.info(`failed loading URL: ${err}, retrying in ${RELOAD_INTERVAL / SECOND} seconds`);
	};

	private loadSuccess = (loadURL: string) => {
		return () => {
			const serverInfo = ServerManager.getRemoteInfo(this.view.serverId);
			if (!serverInfo?.serverVersion || semver.gte(serverInfo.serverVersion, '9.4.0')) {
				this.log.verbose('finished loading URL');
				this.parentWindow.webContents.send(LOAD_SUCCESS, this.id);
				this.maxRetries = MAX_SERVER_RETRIES;
				this.status = Status.WAITING_MM;
				this.removeLoading = setTimeout(this.setInitialized, MAX_LOADING_SCREEN_SECONDS, true);
				this.emit(LOAD_SUCCESS, this.id, loadURL);
				if (this.parentWindow && this.currentURL) {
					this.setBounds(getWindowBoundaries(this.parentWindow));
				}
				// Inject window controls next to profile picture
				this.injectWindowControls();
			} else {
				this.parentWindow.webContents.send(LOAD_INCOMPATIBLE_SERVER, this.id, loadURL.toString());
				this.emit(LOAD_FAILED, this.id, 'Incompatible server version', loadURL.toString());
				this.status = Status.ERROR;
			}
		};
	};

	/**
	 * WebContents event handlers
	 */

	private handleUpdateTarget = (e: Event, url: string) => {
		this.log.silly('handleUpdateTarget');
		const parsedURL = parseURL(url);
		if (parsedURL && isInternalURL(parsedURL, ServerManager.getServer(this.view.serverId)?.url ?? this.view.getLoadingURL())) {
			this.emit(UPDATE_TARGET_URL);
		} else {
			this.emit(UPDATE_TARGET_URL, url);
		}
	};

	private handleServerWasModified = (serverId: string) => {
		if (serverId === this.view.serverId) {
			this.reload();
		}
	};

	private handlePageTitleUpdated = (newTitle: string) => {
		this.log.silly('handlePageTitleUpdated');

		if (!ServerManager.getServer(this.view.serverId)?.isLoggedIn) {
			return;
		}

		// Extract just the channel name (everything before the first " - ")
		// Remove any mention count in parentheses at the start
		const parts = newTitle.split(' - ');
		if (parts.length <= 1) {
			ViewManager.updateViewTitle(this.id, newTitle);
			return;
		}

		let channelName = parts.slice(0, -1).join(' - ');

		// Remove mention count if present
		if (channelName.startsWith('(')) {
			const endParenIndex = channelName.indexOf(')');
			if (endParenIndex !== -1) {
				channelName = channelName.substring(endParenIndex + 1).trim();
			}
		}

		// Team name and server name
		const secondPart = parts[parts.length - 1];
		const serverInfo = ServerManager.getRemoteInfo(this.serverId);
		if (serverInfo?.siteName) {
			ViewManager.updateViewTitle(this.id, channelName, secondPart.replace(serverInfo.siteName, '').trim());
		} else {
			ViewManager.updateViewTitle(this.id, channelName, secondPart);
		}
	};

	private handleAltBlur = () => {
		this.altPressStatus = false;
	};

	private injectWindowControls = () => {
		console.log('Injecting window controls...');

		// Set up IPC listeners for window control events from web content
		this.webContentsView.webContents.on('ipc-message', (_event: Event, channel: string, ...args: unknown[]) => {
			this.log.debug('MattermostWebContentsView', `Received IPC message: ${channel}`, args);

			switch (channel) {
				case 'desktop-minimize-window':
					MainWindow.get()?.minimize();
					break;
				case 'desktop-maximize-window':
					const mainWindow = MainWindow.get();
					if (mainWindow?.isMaximized()) {
						mainWindow.unmaximize();
					} else {
						mainWindow?.maximize();
					}
					break;
				case 'desktop-close-window':
					MainWindow.get()?.close();
					break;
				case 'desktop-switch-server':
					if (args[0]) {
						ServerManager.updateCurrentServer(args[0] as string);
					}
					break;
			}
		});

		const injectionCode = `
			(() => {
				console.log('Window controls injection script running...');
				// Add CSS for window controls
				const style = document.createElement('style');
				style.textContent = 
					'/* Global base: nothing is draggable unless explicitly set */' +
					'*, *::before, *::after {' +
						'-webkit-app-region: no-drag;' +
					'}' +
					'/* Ensure iframes and their contents are always interactive */' +
					'iframe {' +
						'-webkit-app-region: no-drag !important;' +
						'pointer-events: auto !important;' +
					'}' +
					'.desktop-window-controls {' +
						'display: flex;' +
						'align-items: center;' +
						'gap: 6px;' +
						'height: 32px;' +
						'margin-left: 8px;' +
						'z-index: 999999 !important;' +
						'position: relative !important;' +
						'pointer-events: auto !important;' +
						'-webkit-app-region: no-drag !important;' +
					'}' +
					'.desktop-window-controls .control-button {' +
						'display: flex;' +
						'align-items: center;' +
						'justify-content: center;' +
						'width: 32px;' +
						'height: 32px;' +
						'border: none;' +
						'background: transparent;' +
						'cursor: pointer !important;' +
						'border-radius: 4px;' +
						'color: var(--sidebar-text-60, rgba(255, 255, 255, 0.6));' +
						'transition: all 0.15s ease;' +
						'pointer-events: auto !important;' +
						'z-index: 999999 !important;' +
						'position: relative !important;' +
						'-webkit-app-region: no-drag !important;' +
						'-webkit-user-select: none !important;' +
						'user-select: none !important;' +
						'overflow: visible !important;' +
					'}' +
					'.desktop-window-controls .control-button:hover {' +
						'background: var(--sidebar-text-08, rgba(255, 255, 255, 0.08));' +
						'color: var(--sidebar-text, rgba(255, 255, 255, 0.9));' +
					'}' +
					'.desktop-window-controls .control-button.close:hover {' +
						'background: #e81123;' +
						'color: white;' +
					'}' +
					'.desktop-window-controls svg {' +
						'width: 12px;' +
						'height: 12px;' +
					'}' +
					'.desktop-drag-handle {' +
						'display: flex;' +
						'align-items: center;' +
						'justify-content: center;' +
						'width: 28px;' +
						'height: 32px;' +
						'cursor: move;' +
						'-webkit-app-region: no-drag !important;' +
						'pointer-events: auto !important;' +
						'margin-right: 4px;' +
						'border-radius: 4px;' +
						'transition: background-color 0.15s ease;' +
						'color: var(--sidebar-text-60, rgba(255, 255, 255, 0.6));' +
						'font-size: 16px;' +
						'user-select: none;' +
						'-webkit-user-select: none;' +
					'}' +
					'.desktop-drag-handle:hover {' +
						'background: var(--sidebar-text-08, rgba(255, 255, 255, 0.08));' +
						'color: var(--sidebar-text, rgba(255, 255, 255, 0.9));' +
					'}' +
					'.desktop-app-toggle {' +
						'display: flex;' +
						'align-items: center;' +
						'justify-content: center;' +
						'width: auto;' +
						'height: 32px;' +
						'padding: 0 8px;' +
						'border: none;' +
						'background: transparent;' +
						'cursor: pointer !important;' +
						'border-radius: 4px;' +
						'color: var(--sidebar-text-60, rgba(255, 255, 255, 0.6));' +
						'transition: all 0.15s ease;' +
						'pointer-events: auto !important;' +
						'z-index: 999999 !important;' +
						'position: relative !important;' +
						'-webkit-app-region: no-drag !important;' +
						'font-size: 12px;' +
						'font-weight: 600;' +
						'white-space: nowrap;' +
					'}' +
					'.desktop-app-toggle:hover {' +
						'background: var(--sidebar-text-08, rgba(255, 255, 255, 0.08));' +
						'color: var(--sidebar-text, rgba(255, 255, 255, 0.9));' +
					'}';
				document.head.appendChild(style);
				
				// Create window control buttons
				function createWindowControls() {
					console.log('=== CREATING WINDOW CONTROLS ===');
					
					const container = document.createElement('div');
					container.className = 'desktop-window-controls';
					
					// Drag handle with 4-way arrow — uses JS-based drag via IPC
					// (-webkit-app-region: drag can be blocked by page frameworks)
					const dragHandle = document.createElement('div');
					dragHandle.className = 'desktop-drag-handle';
					dragHandle.innerHTML = '✥';
					dragHandle.title = 'Drag to move window';

					let isDragging = false;
					let dragStartX = 0;
					let dragStartY = 0;

					dragHandle.addEventListener('mousedown', function(e) {
						if (e.button !== 0) return;
						isDragging = true;
						dragStartX = e.screenX;
						dragStartY = e.screenY;
						e.preventDefault();
						e.stopPropagation();
					}, true);

					document.addEventListener('mousemove', function(e) {
						if (!isDragging) return;
						const deltaX = e.screenX - dragStartX;
						const deltaY = e.screenY - dragStartY;
						if (deltaX !== 0 || deltaY !== 0) {
							window.postMessage({ type: 'WINDOW_DRAG', deltaX: deltaX, deltaY: deltaY }, '*');
							dragStartX = e.screenX;
							dragStartY = e.screenY;
						}
					}, true);

					document.addEventListener('mouseup', function() {
						isDragging = false;
					}, true);

					console.log('Created drag handle with JS-based drag');
					
					// App toggle button (Aura/Chat)
					const toggleBtn = document.createElement('button');
					toggleBtn.className = 'desktop-app-toggle';
					toggleBtn.textContent = 'Chat';
					toggleBtn.title = 'Switch to Chat';
					console.log('Created toggle button');
					
				// Multiple event binding approaches for toggle
				toggleBtn.onmousedown = function(e) {
					console.log('=== TOGGLE BUTTON CLICKED ===');
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					
					try {
					// Use window.postMessage to communicate with main process
					window.postMessage({ type: 'SWITCH_APP' }, '*');
					console.log('App switch command sent via postMessage');
				} catch (err) {
					console.error('Error switching apps:', err);
				}
			};
			

			
			// Update toggle text based on current app
			function updateToggleText() {
				const isAura = window.location.href.includes('aura') || !window.location.href.includes('collab');
				toggleBtn.textContent = isAura ? 'Chat' : 'Aura';
				toggleBtn.title = 'Switch to ' + (isAura ? 'Chat' : 'Aura');
			}
			updateToggleText();
				
			// Fallback: periodically check URL and update toggle text
			setInterval(() => {
				updateToggleText();
			}, 1000);
			
			// Minimize button
			const minimizeBtn = document.createElement('button');
			minimizeBtn.className = 'control-button minimize';
			minimizeBtn.title = 'Minimize';
			minimizeBtn.innerHTML = '<svg viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="1" fill="currentColor"/></svg>';
			
			minimizeBtn.onmousedown = function(e) {
				console.log('=== MINIMIZE BUTTON CLICKED ===');
						e.preventDefault();
						e.stopPropagation();
						e.stopImmediatePropagation();
						
					try {
						window.postMessage({ type: 'MINIMIZE_WINDOW' }, '*');
						console.log('Minimize command sent');
					} catch (err) {
						console.error('Error minimizing window:', err);
					}
				};
				

				
				// Maximize button
				const maximizeBtn = document.createElement('button');
				maximizeBtn.className = 'control-button maximize';
				maximizeBtn.title = 'Maximize';
				maximizeBtn.innerHTML = '<svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="0.8"/></svg>';
				
				maximizeBtn.onmousedown = function(e) {
					console.log('=== MAXIMIZE BUTTON CLICKED ===');
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					
					try {
						window.postMessage({ type: 'MAXIMIZE_WINDOW' }, '*');
						console.log('Maximize command sent');
					} catch (err) {
						console.error('Error maximizing window:', err);
					}
				};
				

				
				// Close button
				const closeBtn = document.createElement('button');
				closeBtn.className = 'control-button close';
				closeBtn.title = 'Close';
				closeBtn.innerHTML = '<svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/></svg>';
				
				closeBtn.onmousedown = function(e) {
					console.log('=== CLOSE BUTTON CLICKED ===');
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					
					try {
						window.postMessage({ type: 'CLOSE_WINDOW' }, '*');
						console.log('Close command sent');
					} catch (err) {
						console.error('Error closing window:', err);
					}
				};
				

				
				container.appendChild(dragHandle);
				container.appendChild(toggleBtn);
				

				container.appendChild(minimizeBtn);
				container.appendChild(maximizeBtn);
				container.appendChild(closeBtn);
				
				console.log('Window controls container created successfully with', container.children.length, 'children');
				return container;
			}
			
			// Inject controls near profile picture - support both Mattermost and Collab headers
			function injectControls() {
					console.log('=== TRYING TO INJECT CONTROLS ===');
					
					// Check if controls already exist
					if (document.querySelector('.desktop-window-controls')) {
						console.log('Controls already exist, skipping injection');
						return true;
					}
					
					const selectors = [
						// Mattermost (Aura) selectors
						'#global-header .RightControls',
						'#global-header [class*="RightControls"]',
						'.GlobalHeader .RightControls',
						'[class*="GlobalHeader"] [class*="RightControls"]',
						'header [class*="RightControls"]',
						// Collab (Chat) selectors - target the right side div
						'header.sticky .flex.items-center.gap-3:last-child',
						'header .flex.items-center.gap-3:has([data-tour="user-menu"])',
						'header .flex.items-center:has([data-tour="user-menu"]):last-child'
					];
					
					console.log('Checking selectors:', selectors);
					for (const selector of selectors) {
						console.log('Trying selector:', selector);
						const target = document.querySelector(selector);
						console.log('Found element:', target ? 'YES' : 'NO', target);
						
						if (target) {
							console.log('INJECTING CONTROLS into:', selector);
							target.appendChild(createWindowControls());
							console.log('INJECTION SUCCESS - Controls added to DOM');
							return true;
						}
					}
					
					// Fallback: No header found, create fixed element in top right
					console.log('NO HEADER FOUND - Creating fixed fallback element');
					const fixedContainer = document.createElement('div');
					fixedContainer.style.position = 'fixed';
					fixedContainer.style.top = '8px';
					fixedContainer.style.backgroundColor = 'rgba(0, 0, 0)';
					fixedContainer.style.right = '8px';
					fixedContainer.style.zIndex = '999999';
					fixedContainer.style.pointerEvents = 'auto';
					fixedContainer.appendChild(createWindowControls());
					document.body.appendChild(fixedContainer);
					console.log('FALLBACK INJECTION SUCCESS - Fixed controls added to body');
					return true;
				}
				
				// Try to inject immediately
				injectControls();
				
				// Also observe DOM changes to re-inject if header appears later
				const observer = new MutationObserver(() => {
					// Only re-inject if we find a header and controls are currently fixed
					const hasFixedControls = document.querySelector('.desktop-window-controls')?.parentElement?.style?.position === 'fixed';
					const hasHeader = document.querySelector('header [class*="RightControls"]') || 
					                  document.querySelector('header .flex.items-center:has([data-tour="user-menu"])');
					
					if (hasFixedControls && hasHeader) {
						// Remove fixed container and re-inject into header
						const fixedContainer = document.querySelector('.desktop-window-controls')?.parentElement;
						if (fixedContainer) {
							fixedContainer.remove();
							injectControls();
							observer.disconnect();
						}
					}
				});
				observer.observe(document.body, { childList: true, subtree: true });

				// Delegated click handler for any element with class 'mattermost-chat-desktop'
				// Uses capture-phase delegation so it works even if the page stops propagation
				document.addEventListener('click', function(e) {
					const target = e.target && e.target.closest('.mattermost-chat-desktop');
					if (target) {
						e.preventDefault();
						e.stopPropagation();
						e.stopImmediatePropagation();
						window.postMessage({ type: 'SWITCH_APP' }, '*');
						console.log('mattermost-chat-desktop click - SWITCH_APP triggered');
					}
				}, true);
				console.log('mattermost-chat-desktop click handler registered');
			})();
		`;

		try {
			this.webContentsView.webContents.executeJavaScript(injectionCode);
		} catch (error) {
			this.log.error('Failed to inject window controls', error);
		}
	};

	private generateContextMenu = (): Options => {
		const server = ServerManager.getServer(this.view.serverId);
		if (!server) {
			return {};
		}

		return {
			append: (_, parameters) => {
				const parsedURL = parseURL(parameters.linkURL);
				if (parsedURL && isInternalURL(parsedURL, server.url)) {
					return [
						{
							type: 'separator' as const,
						},
						{
							label: localizeMessage('app.menus.contextMenu.openInNewTab', 'Open in new tab'),
							enabled: !ViewManager.isViewLimitReached(),
							click() {
								NavigationManager.openLinkInNewTab(parsedURL.toString());
							},
						},
						{
							label: localizeMessage('app.menus.contextMenu.openInNewWindow', 'Open in new window'),
							enabled: !ViewManager.isViewLimitReached(),
							click() {
								NavigationManager.openLinkInNewWindow(parsedURL.toString());
							},
						},
					];
				}
				return [];
			},
		};
	};
}
