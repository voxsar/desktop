// Copyright (c) 2016-present Aura, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React from 'react';
import type {DraggingStyle, DropResult, NotDraggingStyle} from 'react-beautiful-dnd';
import {DragDropContext, Draggable, Droppable} from 'react-beautiful-dnd';
import ReactDOM from 'react-dom';
import {FormattedMessage} from 'react-intl';

import {TAB_BAR_HEIGHT, THREE_DOT_MENU_WIDTH_MAC} from 'common/utils/constants';

import type {UniqueServer} from 'types/config';

import './css/dropdown.scss';

import IntlProvider from './intl_provider';
import setupDarkMode from './modals/darkMode';

setupDarkMode();

type State = {
    servers?: UniqueServer[];
    serverOrder?: string[];
    orderedServers?: UniqueServer[];
    activeServer?: string;
    enableServerManagement?: boolean;
    unreads?: Map<string, boolean>;
    mentions?: Map<string, number>;
    expired?: Map<string, boolean>;
    hasGPOServers?: boolean;
    isAnyDragging: boolean;
    windowBounds?: Electron.Rectangle;
    nonce?: string;
}

function getStyle(style?: DraggingStyle | NotDraggingStyle) {
    if (style?.transform) {
        const axisLockY = `translate(0px${style.transform.slice(style.transform.indexOf(','), style.transform.length)}`;
        return {
            ...style,
            transform: axisLockY,
        };
    }
    return style;
}
class ServerDropdown extends React.PureComponent<Record<string, never>, State> {
    buttonRefs: Map<number, HTMLButtonElement>;
    addServerRef: React.RefObject<HTMLButtonElement>;
    focusedIndex: number | null;

    constructor(props: Record<string, never>) {
        super(props);
        this.state = {
            isAnyDragging: false,
        };
        this.focusedIndex = null;

        this.buttonRefs = new Map();
        this.addServerRef = React.createRef();

        window.desktop.serverDropdown.onUpdateServerDropdown(this.handleUpdate);
    }

    handleUpdate = (
        servers: UniqueServer[],
        windowBounds: Electron.Rectangle,
        activeServer?: string,
        enableServerManagement?: boolean,
        hasGPOServers?: boolean,
        expired?: Map<string, boolean>,
        mentions?: Map<string, number>,
        unreads?: Map<string, boolean>,
    ) => {
        this.setState({
            servers,
            activeServer,
            enableServerManagement,
            hasGPOServers,
            unreads,
            mentions,
            expired,
            windowBounds,
        });
    };

    selectServer = (server: UniqueServer) => {
        return () => {
            if (!server.id) {
                return;
            }
            window.desktop.serverDropdown.switchServer(server.id);
            this.closeMenu();
        };
    };

    closeMenu = () => {
        if (!this.state.isAnyDragging) {
            (document.activeElement as HTMLElement).blur();
            window.desktop.closeServersDropdown();
        }
    };

    preventPropagation = (event: React.MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
    };

    addServer = () => {
        window.desktop.serverDropdown.showNewServerModal();
        this.closeMenu();
    };

    isActiveServer = (server: UniqueServer) => {
        return server.id === this.state.activeServer;
    };

    onDragStart = () => {
        this.setState({isAnyDragging: true});
    };

    onDragEnd = (result: DropResult) => {
        const removedIndex = result.source.index;
        const addedIndex = result.destination?.index;
        if (addedIndex === undefined || removedIndex === addedIndex) {
            this.setState({isAnyDragging: false});
            return;
        }
        if (!this.state.servers) {
            throw new Error('No config');
        }
        const serversCopy = this.state.servers.concat();

        const server = serversCopy.splice(removedIndex, 1);
        const newOrder = addedIndex < this.state.servers.length ? addedIndex : this.state.servers.length - 1;
        serversCopy.splice(newOrder, 0, server[0]);

        this.setState({servers: serversCopy, isAnyDragging: false});
        window.desktop.updateServerOrder(serversCopy.map((server) => server.id!));
    };

    componentDidMount() {
        window.addEventListener('click', this.closeMenu);
        window.addEventListener('keydown', this.handleKeyboardShortcuts);
        window.desktop.getNonce().then((nonce) => {
            this.setState({nonce}, () => {
                window.desktop.serverDropdown.requestInfo();
            });
        });
    }

    componentDidUpdate() {
        window.desktop.serverDropdown.sendSize(document.body.scrollWidth, document.body.scrollHeight);
    }

    componentWillUnmount() {
        window.removeEventListener('click', this.closeMenu);
        window.removeEventListener('keydown', this.handleKeyboardShortcuts);
    }

    setButtonRef = (serverIndex: number, refMethod?: (element: HTMLButtonElement) => unknown) => {
        return (ref: HTMLButtonElement) => {
            this.addButtonRef(serverIndex, ref);
            refMethod?.(ref);
        };
    };

    addButtonRef = (serverIndex: number, ref: HTMLButtonElement | null) => {
        if (ref) {
            this.buttonRefs.set(serverIndex, ref);
            ref.addEventListener('focusin', () => {
                this.focusedIndex = serverIndex;
            });
            ref.addEventListener('blur', () => {
                this.focusedIndex = null;
            });
        }
    };

    handleKeyboardShortcuts = (event: KeyboardEvent) => {
        if (event.key === 'ArrowDown') {
            if (this.focusedIndex === null) {
                this.focusedIndex = 0;
            } else {
                this.focusedIndex = (this.focusedIndex + 1) % this.buttonRefs.size;
            }
            this.buttonRefs.get(this.focusedIndex)?.focus();
        }
        if (event.key === 'ArrowUp') {
            if (this.focusedIndex === null || this.focusedIndex === 0) {
                this.focusedIndex = this.buttonRefs.size - 1;
            } else {
                this.focusedIndex = (this.focusedIndex - 1) % this.buttonRefs.size;
            }
            this.buttonRefs.get(this.focusedIndex)?.focus();
        }
        if (event.key === 'Escape') {
            this.closeMenu();
        }
        this.buttonRefs.forEach((button, index) => {
            if (event.key === String(index + 1)) {
                button.focus();
            }
        });
    };

    handleClickOnDragHandle = (event: React.MouseEvent<HTMLDivElement>) => {
        if (this.state.isAnyDragging) {
            event.stopPropagation();
        }
    };

    editServer = (serverId: string) => {
        return (event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            window.desktop.serverDropdown.showEditServerModal(serverId);
            this.closeMenu();
        };
    };

    removeServer = (serverId: string) => {
        if (this.serverIsPredefined(serverId)) {
            return () => { };
        }
        return (event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            window.desktop.serverDropdown.showRemoveServerModal(serverId);
            this.closeMenu();
        };
    };

    serverIsPredefined = (serverId: string) => {
        return this.state.servers?.some((server) => server.id === serverId && server.isPredefined);
    };

    render() {
        if (!this.state.nonce) {
            return null;
        }

        // Multi-server management is disabled - return empty since there's only one server
        return null;
    }
}

ReactDOM.render(
    <ServerDropdown/>,
    document.getElementById('app'),
);
