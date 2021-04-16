import { mocked } from 'ts-jest/utils';
import MockDate from 'mockdate';

import { AccessToken } from '../AccessToken';
import { StaticAuthProvider } from './StaticAuthProvider';
import { RefreshableAuthProvider } from './RefreshableAuthProvider';

import { refreshUserToken as rUT, getTokenInfo as gTI } from '../helpers';
import { TokenInfo } from '../TokenInfo';
jest.mock('../helpers');
const refreshUserToken = mocked(rUT);
const getTokenInfo = mocked(gTI);

type AccessTokenArgs = ConstructorParameters<typeof AccessToken>;
const unwrap = (at: AccessToken | null): AccessTokenArgs | null => {
	if (!at) {
		return null;
	}
	// the AccessToken class hides its data, so we have to cheat to get at it. the private data is not
	// enumerable, so snapshot tests won't be useful without unwrapping it
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any
	return [(at as any)._data, (at as any)._obtainmentDate];
};

describe('RefreshableAuthProvider', () => {
	// use consistent dates so that snapshot testing is consistent
	beforeAll(() => {
		MockDate.set(new Date('2021-04-15T00:00:00.000Z'));
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
	});
	afterAll(() => {
		MockDate.reset();
	});
	it('returns the expected values, does not attempt to refresh', async () => {
		const future = new Date();
		future.setDate(future.getDate() + 1);

		const sap = new StaticAuthProvider('clientId', 'access:initial', ['scope1', 'scope2'], 'user');
		const rap = new RefreshableAuthProvider(sap, {
			clientSecret: 'clientSecret',
			refreshToken: 'refresh:initial',
			expiry: future
		});

		const accessToken = await rap.getAccessToken();
		expect(refreshUserToken).toHaveBeenCalledTimes(0);
		expect(unwrap(accessToken)).toMatchInlineSnapshot(`
		Array [
		  Object {
		    "access_token": "access:initial",
		    "refresh_token": "",
		    "scope": Array [
		      "scope1",
		      "scope2",
		    ],
		  },
		  2021-04-15T00:00:00.000Z,
		]
	`);
	});

	it('refreshes and returns the new values', async () => {
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

	// failing test -- to be addressed in a separate pr
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

		// initially, we shouldn't refresh because the token "hasn't expired yet"
		MockDate.set(past);
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
		    "refresh_token": "",
		    "scope": Array [
		      "scope1",
		      "scope2",
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
		expect(refreshUserToken).toHaveBeenCalledTimes(1);
	});
});
