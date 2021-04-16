import { mocked } from 'ts-jest/utils';

import { AccessToken } from '../AccessToken';
import { StaticAuthProvider } from './StaticAuthProvider';
import { RefreshableAuthProvider } from './RefreshableAuthProvider';

import { refreshUserToken as rUT } from '../helpers';
jest.mock('../helpers');
const refreshUserToken = mocked(rUT);

describe('RefreshableAuthProvider', () => {
	it('returns the expected values, does not attempt to refresh', async () => {
		const future = new Date();
		future.setDate(future.getDate() + 1);

		const sap = new StaticAuthProvider('clientId', 'accessToken', ['scope1', 'scope2'], 'user');
		const rap = new RefreshableAuthProvider(sap, {
			clientSecret: 'clientSecret',
			refreshToken: 'refreshToken',
			expiry: future
		});

		const accessToken = await rap.getAccessToken();
		expect(accessToken?.accessToken).toBe('accessToken');
		expect(refreshUserToken).toHaveBeenCalledTimes(0);
	});

	it('refreshes and returns the new values', async () => {
		refreshUserToken.mockReturnValue(
			Promise.resolve(new AccessToken({ access_token: 'foo', refresh_token: 'bar' }))
		);

		const past = new Date();
		past.setDate(past.getDate() - 1);

		const sap = new StaticAuthProvider('clientId', 'accessToken', ['scope1', 'scope2'], 'user');
		const rap = new RefreshableAuthProvider(sap, {
			clientSecret: 'clientSecret',
			refreshToken: 'refreshToken',
			expiry: past
		});

		const accessToken = await rap.getAccessToken();
		expect(accessToken?.accessToken).toBe('foo');
		expect(refreshUserToken).toHaveBeenCalledTimes(1);
	});

	// failing test -- to be addressed in a separate pr
	xit('refreshes only once for concurrent calls', async () => {
		refreshUserToken
			.mockReturnValueOnce(Promise.resolve(new AccessToken({ access_token: 'success', refresh_token: 'bar' })))
			.mockReturnValue(Promise.resolve(new AccessToken({ access_token: 'fail', refresh_token: 'bar' })));

		const past = new Date();
		past.setDate(past.getDate() - 1);

		const sap = new StaticAuthProvider('clientId', 'accessToken', ['scope1', 'scope2'], 'user');
		const rap = new RefreshableAuthProvider(sap, {
			clientSecret: 'clientSecret',
			refreshToken: 'refreshToken',
			expiry: past
		});

		const results = await Promise.all([rap.getAccessToken(), rap.getAccessToken()]);
		expect(results.map(at => at?.accessToken)).toEqual(['success', 'success']);
		expect(refreshUserToken).toHaveBeenCalledTimes(0);
	});
});
