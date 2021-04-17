import { mocked } from 'ts-jest/utils';
import MockDate from 'mockdate';

import { StaticAuthProvider } from './StaticAuthProvider';

import { getTokenInfo as gTI } from '../helpers';
import { TokenInfo } from '../TokenInfo';
import { unwrap } from '../testhelpers';
import { FatalProviderError } from '../Errors/FatalProviderError';
jest.mock('../helpers');
const getTokenInfo = mocked(gTI);

describe('RefreshableAuthProvider', () => {
	// use consistent dates so that snapshot testing is consistent
	beforeEach(() => {
		getTokenInfo.mockReset();
		MockDate.set(new Date('2021-04-15T00:00:00.000Z'));
	});
	afterEach(() => {
		MockDate.reset();
	});

	it('returns the expected values', async () => {
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

		const sap = new StaticAuthProvider('clientId', 'access:initial', ['scope1', 'scope2'], 'user');

		const accessToken = await sap.getAccessToken();
		expect(unwrap(accessToken)).toMatchInlineSnapshot(`
		Array [
		  Object {
		    "access_token": "access:initial",
		    "expires_in": 1234,
		    "refresh_token": "",
		    "scope": Array [
		      "token_info_scopes",
		    ],
		  },
		  2021-04-15T00:00:00.000Z,
		]
	`);
		expect(getTokenInfo).toHaveBeenCalledTimes(1);
	});
	it('returns the expected values (minimal, erroneous)', async () => {
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

		const sap = new StaticAuthProvider('clientId');
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		expect(sap.getAccessToken()).rejects.toBeInstanceOf(FatalProviderError);
		expect(getTokenInfo).toHaveBeenCalledTimes(0);
	});
	it('returns the expected values (only accessToken)', async () => {
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

		const sap = new StaticAuthProvider('clientId', 'access:initial');

		const accessToken = await sap.getAccessToken();
		expect(unwrap(accessToken)).toMatchInlineSnapshot(`
		Array [
		  Object {
		    "access_token": "access:initial",
		    "expires_in": 1234,
		    "refresh_token": "",
		    "scope": Array [
		      "token_info_scopes",
		    ],
		  },
		  2021-04-15T00:00:00.000Z,
		]
	`);
		expect(getTokenInfo).toHaveBeenCalledTimes(1);
	});
});
