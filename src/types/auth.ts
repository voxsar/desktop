// Copyright (c) 2016-present Aura, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type { AuthenticationResponseDetails, AuthInfo } from 'electron/common';

export type LoginModalData = {
	request: AuthenticationResponseDetails;
	authInfo: AuthInfo;
}
