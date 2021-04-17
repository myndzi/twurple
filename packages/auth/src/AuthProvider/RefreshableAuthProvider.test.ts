import { mocked } from 'ts-jest/utils';
import MockDate from 'mockdate';

import { AccessToken } from '../AccessToken';
import { StaticAuthProvider } from './StaticAuthProvider';
import { RefreshableAuthProvider } from './RefreshableAuthProvider';

import { refreshUserToken as rUT, getTokenInfo as gTI } from '../helpers';
import { TokenInfo } from '../TokenInfo';
import { unwrap } from '../testhelpers';
jest.mock('../helpers');
const refreshUserToken = mocked(rUT);
const getTokenInfo = mocked(gTI);

describe('RefreshableAuthProvider', () => {
	// use consistent dates so that snapshot testing is consistent
	beforeEach(() => {
		MockDate.set(new Date('2021-04-15T00:00:00.000Z'));
	});
	afterEach(() => {
		MockDate.reset();
		refreshUserToken.mockReset();
		getTokenInfo.mockReset();
	});
	it('returns the expected values, does not attempt to refresh, does hydrate', async () => {
		// since we can't instantiate auth providers with complete data,
		// authorization is always hydrated -- at the very least, to fill
		// in "expires_in". This could be cleaned up in the future, but
		// for now, mock it out...
		getTokenInfo.mockReturnValue(
			Promise.resolve(
				new TokenInfo({
					client_id: 'token_info_client_id',
					login: 'token_info_login',
					scopes: ['token_info_scopes'],
					user_id: 'token_info_user_id',
					expires_in: 1234
				})
			)
		);
		const future = new Date();
		future.setDate(future.getDate() + 1);

		const sap = new StaticAuthProvider('clientId', 'access:initial', ['scope1', 'scope2'], 'user');
		const rap = new RefreshableAuthProvider(sap, {
			clientSecret: 'clientSecret',
			refreshToken: 'refresh:initial',
			expiry: future
		});

		const accessToken = await rap.getAccessToken();
		expect(getTokenInfo).toHaveBeenCalledTimes(1);
		expect(refreshUserToken).toHaveBeenCalledTimes(0);
		expect(unwrap(accessToken)).toMatchInlineSnapshot(`
		Array [
		  Object {
		    "access_token": "access:initial",
		    "expires_in": 1234,
		    "refresh_token": "refresh:initial",
		    "scope": Array [
		      "token_info_scopes",
		    ],
		  },
		  2021-04-15T00:00:00.000Z,
		]
	`);
	});

	it('refreshes and returns the new values', async () => {
		getTokenInfo.mockReturnValue(
			Promise.resolve(
				new TokenInfo({
					client_id: 'token_info_client_id',
					login: 'token_info_login',
					scopes: ['token_info_scopes'],
					user_id: 'token_info_user_id',
					expires_in: -86401
				})
			)
		);
		refreshUserToken.mockReturnValue(
			Promise.resolve(
				new AccessToken({
					access_token: 'access:success',
					refresh_token: 'refresh:success',
					expires_in: 123,
					scope: ['returned', 'scopes']
				})
			)
		);

		const past = new Date();
		past.setDate(past.getDate() - 1);

		const sap = new StaticAuthProvider('clientId', 'access:initial', ['scope1', 'scope2'], 'user');
		const rap = new RefreshableAuthProvider(sap, {
			clientSecret: 'clientSecret',
			refreshToken: 'refresh:initial',
			expiry: past
		});

		const accessToken = await rap.getAccessToken();
		expect(getTokenInfo).toHaveBeenCalledTimes(1);
		expect(refreshUserToken).toHaveBeenCalledTimes(1);
		expect(unwrap(accessToken)).toMatchInlineSnapshot(`
		Array [
		  Object {
		    "access_token": "access:success",
		    "expires_in": 123,
		    "refresh_token": "refresh:success",
		    "scope": Array [
		      "returned",
		      "scopes",
		    ],
		  },
		  2021-04-15T00:00:00.000Z,
		]
	`);
	});

	it('refreshes only once for concurrent calls', async () => {
		refreshUserToken
			.mockReturnValueOnce(
				Promise.resolve(
					new AccessToken({
						access_token: 'access:success',
						refresh_token: 'refresh:success',
						expires_in: 123,
						scope: ['returned', 'scopes']
					})
				)
			)
			.mockReturnValueOnce(
				Promise.resolve(
					new AccessToken({
						access_token: 'access:failure',
						refresh_token: 'refresh:failure',
						expires_in: 123,
						scope: ['returned', 'scopes']
					})
				)
			);

		const now = new Date();
		const past = new Date();
		const future = new Date();

		past.setDate(past.getDate() - 1);
		future.setDate(past.getDate() + 1);

		// we won't call refresh, but we will hydrate on instantiation
		MockDate.set(past);
		getTokenInfo.mockReturnValue(
			Promise.resolve(
				new TokenInfo({
					client_id: 'token_info_client_id',
					login: 'token_info_login',
					scopes: ['token_info_scopes'],
					user_id: 'token_info_user_id',
					expires_in: 1
				})
			)
		);
		const sap = new StaticAuthProvider('clientId', 'access:initial', ['scope1', 'scope2'], 'user');
		const rap = new RefreshableAuthProvider(sap, {
			clientSecret: 'clientSecret',
			refreshToken: 'refresh:initial',
			expiry: now
		});
		expect(await rap.getAccessToken().then(unwrap)).toMatchInlineSnapshot(`
		Array [
		  Object {
		    "access_token": "access:initial",
		    "expires_in": 1,
		    "refresh_token": "refresh:initial",
		    "scope": Array [
		      "token_info_scopes",
		    ],
		  },
		  2021-04-14T00:00:00.000Z,
		]
	`);

		// after instantiation, time "passes", now the token has expired; we should
		// make two calls to refresh but they should be consolidated into one
		MockDate.set(future);

		const results = await Promise.all([rap.getAccessToken(), rap.getAccessToken()]);
		expect(results.map(unwrap)).toMatchInlineSnapshot(`
		Array [
		  Array [
		    Object {
		      "access_token": "access:success",
		      "expires_in": 123,
		      "refresh_token": "refresh:success",
		      "scope": Array [
		        "returned",
		        "scopes",
		      ],
		    },
		    2021-04-15T00:00:00.000Z,
		  ],
		  Array [
		    Object {
		      "access_token": "access:success",
		      "expires_in": 123,
		      "refresh_token": "refresh:success",
		      "scope": Array [
		        "returned",
		        "scopes",
		      ],
		    },
		    2021-04-15T00:00:00.000Z,
		  ],
		]
	`);
		expect(results.map(at => at?.accessToken)).toEqual(['access:success', 'access:success']);
		expect(getTokenInfo).toHaveBeenCalledTimes(1);
		expect(refreshUserToken).toHaveBeenCalledTimes(1);
	});
});
