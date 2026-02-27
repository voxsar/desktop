// Copyright (c) 2016-present Aura, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {IpcMainEvent, IpcMainInvokeEvent} from 'electron';
import {ipcMain, net, session} from 'electron';

import MainWindow from 'app/mainWindow/mainWindow';
import ModalManager from 'app/mainWindow/modals/modalManager';
import WebContentsManager from 'app/views/webContentsManager';
import {
    GET_ORDERED_SERVERS,
    SHOW_EDIT_SERVER_MODAL,
    SHOW_NEW_SERVER_MODAL,
    SHOW_REMOVE_SERVER_MODAL,
    TOGGLE_SECURE_INPUT,
    UPDATE_SERVER_ORDER,
    UPDATE_SHORTCUT_MENU,
    VALIDATE_SERVER_URL,
    GET_UNIQUE_SERVERS_WITH_PERMISSIONS,
    ADD_SERVER,
    EDIT_SERVER,
    REMOVE_SERVER,
    GET_LAST_ACTIVE,
    SERVER_SWITCHED,
    GET_CURRENT_SERVER,
    SERVER_REMOVED,
    SWITCH_APP,
    SWITCH_SERVER,
    GET_ACTIVE_APP_NAME,
    APP_SWITCHED,
} from 'common/communication';
import {ModalConstants} from 'common/constants';
import {Logger} from 'common/log';
import {MattermostServer} from 'common/servers/MattermostServer';
import ServerManager from 'common/servers/serverManager';
import {URLValidationStatus} from 'common/utils/constants';
import {isValidURI, isValidURL, parseURL} from 'common/utils/url';
import {type MattermostView} from 'common/views/MattermostView';
import ViewManager from 'common/views/viewManager';
import PermissionsManager from 'main/security/permissionsManager';
import {ServerInfo} from 'main/server/serverInfo';
import {getLocalPreload} from 'main/utils';

import type {Server, UniqueServer} from 'types/config';
import type {Permissions, UniqueServerWithPermissions} from 'types/permissions';
import type {ErrorReason, ServerTestResult, URLValidationResult} from 'types/server';

const log = new Logger('App', 'ServerHub');

export class ServerHub {
    constructor() {
        ipcMain.on(SHOW_NEW_SERVER_MODAL, this.handleShowNewServerModal);
        ipcMain.on(SHOW_EDIT_SERVER_MODAL, this.showEditServerModal);
        ipcMain.on(SHOW_REMOVE_SERVER_MODAL, this.showRemoveServerModal);

        ipcMain.handle(VALIDATE_SERVER_URL, this.handleServerURLValidation);
        ipcMain.handle(GET_ORDERED_SERVERS, this.handleGetOrderedServers);
        ipcMain.on(UPDATE_SERVER_ORDER, this.updateServerOrder);
        ipcMain.handle(GET_LAST_ACTIVE, this.handleGetLastActive);
        ipcMain.handle(GET_UNIQUE_SERVERS_WITH_PERMISSIONS, this.getUniqueServersWithPermissions);
        ipcMain.on(ADD_SERVER, this.handleAddServer);
        ipcMain.on(EDIT_SERVER, this.handleEditServer);
        ipcMain.on(REMOVE_SERVER, this.handleRemoveServer);
        ipcMain.handle(GET_CURRENT_SERVER, this.handleGetCurrentServer);

        ipcMain.on(SWITCH_APP, this.handleSwitchApp);
        ipcMain.on(SWITCH_SERVER, this.handleSwitchServer);
        ipcMain.handle(GET_ACTIVE_APP_NAME, this.handleGetActiveAppName);

        ServerManager.on(SERVER_SWITCHED, this.handleServerCurrentChanged);
        ServerManager.on(SERVER_REMOVED, this.handleServerCleanup);
    }

    // TODO: Move me somewhere else later
    handleServerCurrentChanged = () => {
        ipcMain.emit(TOGGLE_SECURE_INPUT, null, false);
        ipcMain.emit(UPDATE_SHORTCUT_MENU);
    };

    private handleGetCurrentServer = () => {
        const serverId = ServerManager.getCurrentServerId();
        if (!serverId) {
            return {server: undefined, view: undefined};
        }
        const server = ServerManager.getServer(serverId);
        if (!server) {
            return {server: undefined, view: undefined};
        }
        return server.toUniqueServer();
    };

    private handleGetActiveAppName = () => {
        const serverId = ServerManager.getCurrentServerId();
        if (!serverId) {
            return 'Aura';
        }
        const server = ServerManager.getServer(serverId);
        return server?.name ?? 'Aura';
    };

    private handleSwitchApp = async (event: IpcMainEvent) => {
        log.debug('handleSwitchApp called');

        const currentServerId = ServerManager.getCurrentServerId();
        const allServers = ServerManager.getAllServers();

        if (allServers.length < 2) {
            log.warn('Cannot switch app - less than 2 servers configured');
            return;
        }

        // Find the other server (toggle between the two)
        const currentServer = currentServerId ? ServerManager.getServer(currentServerId) : undefined;
        const otherServer = allServers.find((srv) => srv.id !== currentServerId);

        if (!otherServer) {
            log.warn('Cannot find other server to switch to');
            return;
        }

        log.info(`Switching app from ${currentServer?.name ?? 'unknown'} to ${otherServer.name}`);

        // If switching to Collab, try auto-login via Aura token if Collab has no session yet
        if (otherServer.url.toString().includes('collab.artslabcreatives.com')) {
            const alreadyAuthed = await this.isCollabAuthenticated(otherServer.url.toString());
            if (!alreadyAuthed) {
                try {
                    const token = await this.getAuraAuthToken(currentServer?.id);
                    if (token) {
                        const email = await this.fetchAuraUserEmail(token);
                        if (email) {
                            log.info(`Auto-login to Collab with email: ${email}`);
                            ServerManager.updateCurrentServer(otherServer.id);

                            const primaryView = ViewManager.getPrimaryView(otherServer.id);
                            if (primaryView) {
                                const webContentsView = WebContentsManager.getView(primaryView.id);
                                if (webContentsView) {
                                    const base = otherServer.url.toString().replace(/\/$/, '');
                                    const loginUrl = `${base}/email_login?email=${encodeURIComponent(email)}&redirect_to=%2Fartslab-creatives%2Fchannels%2Ftown-square`;
                                    webContentsView.load(parseURL(loginUrl));
                                }
                            }

                            const mainWindow = MainWindow.get();
                            if (mainWindow) {
                                mainWindow.webContents.send(APP_SWITCHED, otherServer.name);
                            }
                            return;
                        }
                    }
                } catch (err) {
                    log.error('Failed to auto-login to Collab', err);
                }
            }
        }

        ServerManager.updateCurrentServer(otherServer.id);

        // Notify the renderer about the app switch
        const mainWindow = MainWindow.get();
        if (mainWindow) {
            mainWindow.webContents.send(APP_SWITCHED, otherServer.name);
        }
    };

    private handleSwitchServer = async (event: IpcMainEvent, serverId: string) => {
        log.debug('handleSwitchServer', {serverId});

        const server = ServerManager.getServer(serverId);
        if (!server) {
            log.error('Server not found:', serverId);
            return;
        }

        // If switching to Collab, try auto-login via Aura token if Collab has no session yet
        if (server.url.toString().includes('collab.artslabcreatives.com')) {
            const alreadyAuthed = await this.isCollabAuthenticated(server.url.toString());
            if (!alreadyAuthed) {
                try {
                    const currentServerId = ServerManager.getCurrentServerId();
                    const token = await this.getAuraAuthToken(currentServerId ?? undefined);
                    if (token) {
                        const email = await this.fetchAuraUserEmail(token);
                        if (email) {
                            log.info(`Auto-login to Collab via SWITCH_SERVER with email: ${email}`);
                            ServerManager.updateCurrentServer(serverId);

                            const primaryView = ViewManager.getPrimaryView(serverId);
                            if (primaryView) {
                                const webContentsView = WebContentsManager.getView(primaryView.id);
                                if (webContentsView) {
                                    const base = server.url.toString().replace(/\/$/, '');
                                    const loginUrl = `${base}/email_login?email=${encodeURIComponent(email)}&redirect_to=%2Fartslab-creatives%2Fchannels%2Ftown-square`;
                                    webContentsView.load(parseURL(loginUrl));
                                }
                            }
                            return;
                        }
                    }
                } catch (err) {
                    log.error('Failed to auto-login to Collab via SWITCH_SERVER', err);
                }
            }
        }

        ServerManager.updateCurrentServer(serverId);
    };

    /**
	 * Reads the 'auth_token' key from the Aura server's localStorage via the view's WebContents.
	 * Returns null if the view isn't available or has no token stored.
	 */
    private getAuraAuthToken = async (auraServerId?: string): Promise<string | null> => {
        if (!auraServerId) {
            const allServers = ServerManager.getAllServers();
            const aura = allServers.find((s) => s.url.toString().includes('aura.artslabcreatives.com'));
            if (!aura) {
                return null;
            }
            auraServerId = aura.id;
        }

        const primaryView = ViewManager.getPrimaryView(auraServerId);
        if (!primaryView) {
            return null;
        }
        const webContentsView = WebContentsManager.getView(primaryView.id);
        if (!webContentsView || webContentsView.isDestroyed()) {
            return null;
        }

        try {
            const token = await webContentsView.getWebContentsView().webContents.executeJavaScript(
                'localStorage.getItem("auth_token")',
            );
            return typeof token === 'string' && token.length > 0 ? token : null;
        } catch (err) {
            log.error('Failed to read auth_token from Aura localStorage', err);
            return null;
        }
    };

    /**
	 * Calls https://aura.artslabcreatives.com/api/user with a Bearer token
	 * and returns the email address of the signed-in user.
	 */
    private fetchAuraUserEmail = (token: string): Promise<string | null> => {
        return new Promise((resolve) => {
            const apiUrl = 'https://aura.artslabcreatives.com/api/user';
            const req = net.request({url: apiUrl, session: session.defaultSession});
            req.setHeader('Authorization', `Bearer ${token}`);

            req.on('response', (response) => {
                if (response.statusCode === 200) {
                    let raw = '';
                    response.on('data', (chunk: Buffer) => {
                        raw += `${chunk}`;
                    });
                    response.on('end', () => {
                        try {
                            const user = JSON.parse(raw);
                            resolve(user.email ?? null);
                        } catch {
                            log.error('Failed to parse Aura user data');
                            resolve(null);
                        }
                    });
                } else {
                    log.error(`Aura /api/user returned status ${response.statusCode}`);
                    resolve(null);
                }
            });

            req.on('error', (err) => {
                log.error('Error calling Aura /api/user', err);
                resolve(null);
            });

            req.end();
        });
    };

    /**
	 * Checks whether the MMAUTHTOKEN cookie is already set for collab.artslabcreatives.com,
	 * meaning the user already has an active Collab session.
	 */
    private isCollabAuthenticated = async (collabUrl: string): Promise<boolean> => {
        try {
            const origin = new URL(collabUrl).origin;
            const cookies = await session.defaultSession.cookies.get({
                url: origin,
                name: 'MMAUTHTOKEN',
            });
            return cookies.length > 0;
        } catch {
            return false;
        }
    };

    /**
	 * Server Modals
	 */

    showNewServerModal = (prefillURL?: string) => {
        log.debug('showNewServerModal');

        const mainWindow = MainWindow.get();
        if (!mainWindow) {
            return;
        }

        const modalPromise = ModalManager.addModal<{ prefillURL?: string }, Server>(
            ModalConstants.NEW_SERVER_MODAL,
            'mattermost-desktop://renderer/newServer.html',
            getLocalPreload('internalAPI.js'),
            {prefillURL},
            mainWindow,
            !ServerManager.hasServers(),
        );

        modalPromise.then(async (data) => {
            let initialLoadURL;
            if (prefillURL) {
                const parsedServerURL = parseURL(data.url);
                if (parsedServerURL) {
                    initialLoadURL = parseURL(`${parsedServerURL.origin}${prefillURL.substring(prefillURL.indexOf('/'))}`);
                }
            }

            ServerManager.addServer(data, initialLoadURL);
        }).catch((e) => {
            // e is undefined for user cancellation
            if (e) {
                log.error(`there was an error in the new server modal: ${e}`);
            }
        });
    };

    private handleShowNewServerModal = () => this.showNewServerModal();

    private showEditServerModal = (e: IpcMainEvent, id: string) => {
        log.debug('showEditServerModal', {id});

        const mainWindow = MainWindow.get();
        if (!mainWindow) {
            return;
        }
        const server = ServerManager.getServer(id);
        if (!server) {
            return;
        }

        const modalPromise = ModalManager.addModal<UniqueServerWithPermissions, { server: Server; permissions: Permissions }>(
            ModalConstants.EDIT_SERVER_MODAL,
            'mattermost-desktop://renderer/editServer.html',
            getLocalPreload('internalAPI.js'),
            {server: server.toUniqueServer(), permissions: PermissionsManager.getForServer(server) ?? {}},
            mainWindow);

        modalPromise.then(async (data) => {
            if (!server.isPredefined) {
                ServerManager.editServer(id, data.server);
            }
            PermissionsManager.setForServer(server, data.permissions);
        }).catch((e) => {
            // e is undefined for user cancellation
            if (e) {
                log.error(`there was an error in the edit server modal: ${e}`);
            }
        });
    };

    private showRemoveServerModal = (e: IpcMainEvent, id: string) => {
        log.debug('handleRemoveServerModal', {id});

        const mainWindow = MainWindow.get();
        if (!mainWindow) {
            return;
        }
        const server = ServerManager.getServer(id);
        if (!server) {
            return;
        }

        const modalPromise = ModalManager.addModal<null, boolean>(
            ModalConstants.REMOVE_SERVER_MODAL,
            'mattermost-desktop://renderer/removeServer.html',
            getLocalPreload('internalAPI.js'),
            null,
            mainWindow,
        );

        modalPromise.then(async (remove) => {
            if (remove) {
                ServerManager.removeServer(server.id);
            }
        }).catch((e) => {
            // e is undefined for user cancellation
            if (e) {
                log.error(`there was an error in the edit server modal: ${e}`);
            }
        });
    };

    /**
	 * IPC Handlers
	 */

    private handleServerURLValidation = async (
        e: IpcMainInvokeEvent,
        url?: string,
        currentId?: string,
    ): Promise<URLValidationResult> => {
        log.verbose('handleServerURLValidation', {currentId});

        // If the URL is missing or null, reject
        if (!url) {
            log.debug('handleServerURLValidation: URL is missing');
            return {status: URLValidationStatus.Missing};
        }

        let httpUrl = url;
        if (!isValidURL(url)) {
            // If it already includes the protocol, force it to HTTPS
            if (isValidURI(url) && !url.toLowerCase().startsWith('http')) {
                log.debug('handleServerURLValidation: URL is valid host but does not start with http');
                httpUrl = url.replace(/^((.+):\/\/)?/, 'https://');
            } else if (!'https://'.startsWith(url.toLowerCase()) && !'http://'.startsWith(url.toLowerCase())) {
                // Check if they're starting to type `http(s)`, otherwise add HTTPS for them
                log.debug('handleServerURLValidation: Added HTTPS to URL');
                httpUrl = `https://${url}`;
            }
        }

        // Make sure the final URL is valid
        const parsedURL = parseURL(httpUrl);
        if (!parsedURL) {
            log.debug('handleServerURLValidation: URL is invalid');
            return {status: URLValidationStatus.Invalid};
        }

        // Try and add HTTPS to see if we can get a more secure URL
        let secureURL = parsedURL;
        if (parsedURL.protocol === 'http:') {
            log.verbose('handleServerURLValidation: Attempting to upgrade HTTP to HTTPS');
            secureURL = parseURL(parsedURL.toString().replace(/^http:/, 'https:')) ?? parsedURL;
        }

        // Tell the user if they already have a server for this URL
        const existingServer = ServerManager.lookupServerByURL(secureURL, true);
        if (existingServer && existingServer.id !== currentId) {
            log.verbose(`handleServerURLValidation: Server already exists for URL, current id: ${currentId})`);
            return {
                status: URLValidationStatus.URLExists,
                existingServerName: existingServer.name,
                validatedURL: existingServer.url.toString(),
            };
        }

        // Try and get remote info from the most secure URL, otherwise use the insecure one
        let remoteURL = secureURL;
        const insecureURL = parseURL(secureURL.toString().replace(/^https:/, 'http:'));
        let remoteInfo;
        let preAuthRequired = false;
        let basicAuthRequired = false;
        let clientCertRequired = false;

        const httpsResult = await this.testRemoteServer(secureURL);
        if ('data' in httpsResult) {
            log.debug('handleServerURLValidation: HTTPS test successful');
            remoteInfo = httpsResult.data;
        } else {
            log.debug('handleServerURLValidation: HTTPS test failed', {error: httpsResult.error});

            // Check if HTTPS returned 403
            const httpsNeedsPreAuth = httpsResult.error?.errorReason?.needsPreAuth;
            const httpsNeedsBasicAuth = httpsResult.error?.errorReason?.needsBasicAuth;
            const httpsNeedsClientCert = httpsResult.error?.errorReason?.needsClientCert;

            if (insecureURL) {
                // Try to fall back to HTTP
                const httpResult = await this.testRemoteServer(insecureURL);
                if ('data' in httpResult) {
                    log.debug('handleServerURLValidation: HTTP test successful');
                    remoteInfo = httpResult.data;
                    remoteURL = insecureURL;
                } else {
                    log.debug('handleServerURLValidation: HTTP test failed', {error: httpResult.error});

                    // Both HTTPS and HTTP failed
                    const httpNeedsPreAuth = httpResult.error?.errorReason?.needsPreAuth;
                    const httpNeedsBasicAuth = httpResult.error?.errorReason?.needsBasicAuth;
                    const httpNeedsClientCert = httpResult.error?.errorReason?.needsClientCert;
                    if (httpsNeedsPreAuth || httpNeedsPreAuth) {
                        log.debug('handleServerURLValidation: HTTP returned 403 error, pre-auth required');

                        preAuthRequired = true;

                        // Use the URL that returned 403, preferring HTTPS
                        remoteURL = httpsNeedsPreAuth ? secureURL : insecureURL;
                    }
                    if (httpsNeedsBasicAuth || httpNeedsBasicAuth) {
                        log.debug('handleServerURLValidation: HTTP returned 401 error, basic auth required');

                        basicAuthRequired = true;

                        // Use the URL that returned 401, preferring HTTPS
                        remoteURL = httpsNeedsBasicAuth ? secureURL : insecureURL;
                    }
                    if (httpsNeedsClientCert || httpNeedsClientCert) {
                        log.debug('handleServerURLValidation: HTTP returned SSL client cert error, client cert required');

                        clientCertRequired = true;

                        // Use the URL that returned 403, preferring HTTPS
                        remoteURL = httpsNeedsClientCert ? secureURL : insecureURL;
                    }
                }
            } else if (httpsNeedsPreAuth) {
                // No HTTP fallback available, but HTTPS returned 403
                log.debug('handleServerURLValidation: HTTPS returned 403, pre-auth required');

                preAuthRequired = true;
            } else if (httpsNeedsBasicAuth) {
                log.debug('handleServerURLValidation: HTTPS returned 401 error, basic auth required');

                basicAuthRequired = true;
            } else if (httpsNeedsClientCert) {
                log.debug('handleServerURLValidation: HTTPS returned SSL client cert error, client cert required');

                clientCertRequired = true;
            }
        }

        // If we detected a 403 error, return PreAuthRequired status
        if (preAuthRequired) {
            return {
                status: URLValidationStatus.PreAuthRequired,
                validatedURL: remoteURL.toString().replace(/\/$/, ''),
            };
        }

        // If we detected a 401 error, return BasicAuthRequired status
        if (basicAuthRequired) {
            return {
                status: URLValidationStatus.BasicAuthRequired,
                validatedURL: remoteURL.toString().replace(/\/$/, ''),
            };
        }

        // If we detected a client cert SSL error, return ClientCertRequired status
        if (clientCertRequired) {
            return {
                status: URLValidationStatus.ClientCertRequired,
                validatedURL: remoteURL.toString().replace(/\/$/, ''),
            };
        }

        // If we can't get the remote info, warn the user that this might not be the right URL
        // If the original URL was invalid, don't replace that as they probably have a typo somewhere
        // Also strip the trailing slash if it's there so that the user can keep typing
        if (!remoteInfo) {
            log.debug('handleServerURLValidation: Remote info is missing');

            // If the URL provided has a path, try to validate the server with parts of the path removed,
            // until we reach the root and then return a failure
            if (parsedURL.pathname !== '/') {
                log.debug('handleServerURLValidation: Trying to validate with path removed');
                return this.handleServerURLValidation(
                    e,
                    parsedURL.toString().substring(0, parsedURL.toString().lastIndexOf('/')),
                    currentId,
                );
            }

            log.debug('handleServerURLValidation: Remote info is missing, returning NotMattermost');
            return {
                status: URLValidationStatus.NotMattermost,
                validatedURL: parsedURL.toString().replace(/\/$/, ''),
            };
        }

        const remoteServerName = remoteInfo.siteName === 'Mattermost' ? remoteURL.host.split('.')[0] : remoteInfo.siteName;

        // If we were only able to connect via HTTP, warn the user that the connection is not secure
        if (remoteURL.protocol === 'http:') {
            log.info('handleServerURLValidation: Remote URL is HTTP, returning Insecure');
            return {
                status: URLValidationStatus.Insecure,
                serverVersion: remoteInfo.serverVersion,
                serverName: remoteServerName,
                validatedURL: remoteURL.toString(),
            };
        }

        // If the URL doesn't match the Site URL, set the URL to the correct one
        if (remoteInfo.siteURL && remoteURL.toString() !== new URL(remoteInfo.siteURL).toString()) {
            log.verbose('handleServerURLValidation: Remote URL does not match Site URL, checking Site URL');
            const parsedSiteURL = parseURL(remoteInfo.siteURL);
            if (parsedSiteURL) {
                // Check the Site URL as well to see if it's already pre-configured
                const existingServer = ServerManager.lookupServerByURL(parsedSiteURL, true);
                if (existingServer && existingServer.id !== currentId) {
                    log.info('handleServerURLValidation: Site URL already exists, returning URLExists');
                    return {
                        status: URLValidationStatus.URLExists,
                        existingServerName: existingServer.name,
                        validatedURL: existingServer.url.toString(),
                    };
                }

                // If we can't reach the remote Site URL, there's probably a configuration issue
                const remoteSiteURLResult = await this.testRemoteServer(parsedSiteURL);
                if ('error' in remoteSiteURLResult) {
                    log.debug('handleServerURLValidation: Site URL not reachable, returning URLNotMatched');
                    return {
                        status: URLValidationStatus.URLNotMatched,
                        serverVersion: remoteInfo.serverVersion,
                        serverName: remoteServerName,
                        validatedURL: remoteURL.toString(),
                    };
                }
            }

            // Otherwise fix it for them and return
            log.debug('handleServerURLValidation: Remote URL matches Site URL, returning URLUpdated');
            return {
                status: URLValidationStatus.URLUpdated,
                serverVersion: remoteInfo.serverVersion,
                serverName: remoteServerName,
                validatedURL: remoteInfo.siteURL,
            };
        }

        log.debug('handleServerURLValidation: Remote URL matches Site URL, returning OK');
        return {
            status: URLValidationStatus.OK,
            serverVersion: remoteInfo.serverVersion,
            serverName: remoteServerName,
            validatedURL: remoteURL.toString(),
        };
    };

    private handleGetOrderedServers = () => ServerManager.getOrderedServers().map((srv) => srv.toUniqueServer());

    /**
	 * Helper functions
	 */

    private testRemoteServer = async (parsedURL: URL): Promise<ServerTestResult> => {
        const server = new MattermostServer({name: 'temp', url: parsedURL.toString()}, false, undefined);
        const serverInfo = new ServerInfo(server);
        try {
            // Ping server first for pre-auth - config endpoint might be whitelisted
            await serverInfo.pingServer();

            // Only proceed to fetch config if ping is successful
            const remoteInfo = await serverInfo.fetchConfigData();
            return {data: remoteInfo};
        } catch (error) {
            return {error: error as Error & { errorReason?: ErrorReason }};
        }
    };

    private getUniqueServersWithPermissions = () => {
        return ServerManager.getAllServers().
            map((server) => ({
                server: server.toUniqueServer(),
                permissions: PermissionsManager.getForServer(server) ?? {},
            }));
    };

    private handleAddServer = async (event: IpcMainEvent, server: Server) => {
        log.debug('handleAddServer');

        ServerManager.addServer(server);
    };

    private handleEditServer = async (event: IpcMainEvent, server: UniqueServer, permissions?: Permissions) => {
        log.debug('handleEditServer', {serverId: server.id});

        if (!server.id) {
            return;
        }

        if (!server.isPredefined) {
            ServerManager.editServer(server.id, server);
        }
        if (permissions) {
            const mattermostServer = ServerManager.getServer(server.id);
            if (mattermostServer) {
                PermissionsManager.setForServer(mattermostServer, permissions);
            }
        }
    };

    private handleRemoveServer = async (event: IpcMainEvent, serverId: string) => {
        log.debug('handleRemoveServer', {serverId});

        // Remove the server from ServerManager
        ServerManager.removeServer(serverId);
    };

    private handleServerCleanup = (server: MattermostServer) => {
        log.debug('handleServerCleanup', {serverId: server.id});

        session.defaultSession.clearData({
            origins: [server.url.origin],
        });
    };

    private handleGetLastActive = () => {
        const serverId = ServerManager.getCurrentServerId();
        if (!serverId) {
            return {server: undefined, view: undefined};
        }
        const server = ServerManager.getServer(serverId);
        if (!server) {
            return {server: undefined, view: undefined};
        }
        return {server: server.id, view: server.id};
    };
    private updateServerOrder = (event: IpcMainEvent, serverOrder: string[]) => ServerManager.updateServerOrder(serverOrder);
}

const serverHub = new ServerHub();
export default serverHub;
