// Copyright (c) 2016-present Aura, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type { DownloadedItem } from 'types/downloads';

import DownloadsDropdownItemFile from './DownloadsDropdownItemFile';
import UpdateWrapper from './Update/UpdateWrapper';

type OwnProps = {
	activeItem?: DownloadedItem;
	item: DownloadedItem;
	appName: string;
}

<<<<<<< HEAD
const DownloadsDropdownItem = ({ item, activeItem, appName }: OwnProps) => {
	if (item.type === 'update' && item.state !== 'progressing') {
		return (
			<UpdateWrapper
				item={item}
				appName={appName}
			/>
		);
	}
=======
const DownloadsDropdownItem = ({item, activeItem, appName}: OwnProps) => {
    if (item.type === 'update' && item.state !== 'progressing') {
        return (
            <UpdateWrapper
                item={item}
                appName={appName}
                activeItem={activeItem}
            />
        );
    }
>>>>>>> b473ba39bfc4a853bf658f05ad5d2155dad9fd14

	return (
		<DownloadsDropdownItemFile
			item={item}
			activeItem={activeItem}
			appName={appName}
		/>
	);
};

export default DownloadsDropdownItem;
