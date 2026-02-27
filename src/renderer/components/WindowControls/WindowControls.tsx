// Copyright (c) 2016-present Aura, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';

import './WindowControls.scss';

const WindowControls: React.FC = () => {
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        // Check initial maximized state
        window.desktop.isWindowMaximized().then(setIsMaximized);

        // Listen for maximize changes
        const handleMaximizeChange = (maximized: boolean) => {
            setIsMaximized(maximized);
        };

        window.desktop.onMaximizeChange(handleMaximizeChange);
    }, []);

    const handleMinimize = () => {
        window.desktop.minimizeWindow();
    };

    const handleMaximize = () => {
        window.desktop.maximizeWindow();
    };

    const handleClose = () => {
        window.desktop.closeWindow();
    };

    return (
        <div className='WindowControls'>
            <button
                className='WindowControls__button WindowControls__button--minimize'
                onClick={handleMinimize}
                aria-label='Minimize'
            >
                <i className='icon-window-minimize'/>
            </button>
            <button
                className='WindowControls__button WindowControls__button--maximize'
                onClick={handleMaximize}
                aria-label={isMaximized ? 'Restore' : 'Maximize'}
            >
                {isMaximized ? (
                    <i className='icon-window-restore'/>
                ) : (
                    <i className='icon-window-maximize'/>
                )}
            </button>
            <button
                className='WindowControls__button WindowControls__button--close'
                onClick={handleClose}
                aria-label='Close'
            >
                <i className='icon-close'/>
            </button>
        </div>
    );
};

export default WindowControls;
