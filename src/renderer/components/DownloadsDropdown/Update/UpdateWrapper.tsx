// Copyright (c) 2016-present Aura, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type { DownloadedItem } from 'types/downloads';

import UpdateAvailable from './UpdateAvailable';

import 'renderer/css/components/Button.scss';

type OwnProps = {
<<<<<<< HEAD
	item: DownloadedItem;
	appName: string;
}

const UpdateWrapper = ({ item, appName }: OwnProps) => {
	if (item.state === 'available') {
		return (
			<UpdateAvailable
				item={item}
				appName={appName}
			/>
		);
	}
	if (item.state === 'completed') {
		return (
			<UpdateDownloaded
				item={item}
				appName={appName}
			/>
		);
	}
	return null;
=======
    activeItem?: DownloadedItem;
    item: DownloadedItem;
    appName: string;
}

const UpdateWrapper = ({item, appName, activeItem}: OwnProps) => {
    if (item.state === 'available') {
        return (
            <UpdateAvailable
                item={item}
                appName={appName}
                activeItem={activeItem}
            />
        );
    }
    return null;
>>>>>>> b473ba39bfc4a853bf658f05ad5d2155dad9fd14
};

export default UpdateWrapper;
