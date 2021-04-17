import { Enumerable } from '@d-fischer/shared-utils';
import { rtfm } from '@twurple/common';
import { AccessToken } from '../AccessToken';
import { FatalProviderError } from '../Errors/FatalProviderError';
import { AbstractProvider } from './AbstractProvider';
import type { RefreshableCredentials, LoadableCredentials } from './AbstractProvider';
import type { AuthProvider, AuthProviderTokenType } from './AuthProvider';

/**
 * Configuration for the {@RefreshableAuthProvider}.
 */
export interface RefreshConfig {
	/**
	 * The client secret of your application.
	 */
	clientSecret: string;

	/**
	 * The refresh token you got when requesting an access token from Twitch.
	 */
	refreshToken: string;

	/**
	 * The date of expiry of your access token.
	 */
	expiry?: Date | null;

	/**
	 * A callback that is called whenever the auth provider refreshes the token, e.g. to save the new data in your database.
	 *
	 * @param token The token data.
	 */
	onRefresh?: (token: AccessToken) => void;
}

/**
 * Enhances another auth provider with the ability to make use of refresh
 * tokens, automatically refreshing the access token whenever necessary.
 */
@rtfm<RefreshableAuthProvider>('auth', 'RefreshableAuthProvider', 'clientId')
export class RefreshableAuthProvider extends AbstractProvider implements AuthProvider {
	@Enumerable(false) private readonly _clientSecret: string;
	@Enumerable(false) private _refreshToken: string;
	private readonly _childProvider: AuthProvider;
	private _initialExpiry?: Date | null;
	private readonly _onRefresh?: (token: AccessToken) => void;

	@Enumerable(false) private _lastKnownAccessToken?: AccessToken;

	/**
	 * Creates a new auth provider based on the given one that can automatically
	 * refresh access tokens.
	 *
	 * @param childProvider The base auth provider.
	 * @param refreshConfig The information necessary to automatically refresh an access token.
	 */
	constructor(childProvider: AuthProvider, refreshConfig: RefreshConfig) {
		super();

		this._clientSecret = refreshConfig.clientSecret;
		this._refreshToken = refreshConfig.refreshToken;
		this._childProvider = childProvider;
		this._initialExpiry = refreshConfig.expiry;
		this._onRefresh = refreshConfig.onRefresh;
	}

	async saveCredentials({
		// eslint-disable-next-line @typescript-eslint/naming-convention
		accessToken: access_token,
		// eslint-disable-next-line @typescript-eslint/naming-convention
		refreshToken: refresh_token,
		// eslint-disable-next-line @typescript-eslint/naming-convention
		expiresIn: expires_in,
		scopes: scope,
		timestamp: obtainmentDate
	}: RefreshableCredentials): Promise<void> {
		const tokenData = new AccessToken(
			{
				access_token,
				refresh_token,
				expires_in,
				scope
			},
			obtainmentDate
		);
		this.setAccessToken(tokenData);
		this._refreshToken = tokenData.refreshToken;
		this._initialExpiry = undefined;

		if (this._onRefresh) {
			this._onRefresh(tokenData);
		}
	}

	async loadCredentials(): Promise<LoadableCredentials> {
		const accessToken = (await this._childProvider.getAccessToken())?.accessToken;

		if (typeof accessToken !== 'string') {
			throw new FatalProviderError('Child provider returned a null accessToken');
		}
		return {
			clientId: this._childProvider.clientId,
			clientSecret: this._clientSecret,
			accessToken: accessToken,
			refreshToken: this._refreshToken,
			expiryDate: this._initialExpiry ?? undefined,
			scopes: this._childProvider.currentScopes
		};
	}

	/**
	 * The type of tokens the provider generates.
	 *
	 * It is the same as the underlying base auth provider's token type.
	 */
	get tokenType(): AuthProviderTokenType {
		return this._childProvider.tokenType;
	}

	/**
	 * Retrieves an access token.
	 *
	 * If the current access token does not have the requested scopes, the base auth
	 * provider is called.
	 *
	 * If the current access token is expired, automatically renew it.
	 *
	 * @param scopes The requested scopes.
	 */
	async getAccessToken(scopes?: string | string[]): Promise<AccessToken | null> {
		const fullCreds = await this.fetch();

		if (typeof scopes === 'string') {
			scopes = scopes.split(' ');
		}

		if (scopes?.some(scope => !fullCreds.scopes.includes(scope))) {
			throw new Error('not yet implemented');
		}
		// const oldToken = fullCreds.accessToken;
		// if (oldToken && scopes && scopes.some(scope => !this.currentScopes.includes(scope))) {
		// 	// requesting a new scope should be delegated down...
		// 	const newToken = await this._childProvider.getAccessToken(scopes);
		// 	// ...but if the token doesn't change, carry on
		// 	if (newToken !== oldToken) {
		// 		return newToken;
		// 	}
		// }

		// if we don't have a current token, we just pass this and refresh right away
		// if (oldToken) {
		// 	if (this._initialExpiry) {
		// 		const now = new Date();
		// 		if (now < this._initialExpiry) {
		// 			return oldToken;
		// 		}
		// 	} else if (!oldToken.isExpired) {
		// 		return oldToken;
		// 	}
		// }

		// const refreshedToken = await this.refresh();

		// if (oldToken) {
		// 	return refreshedToken;
		// }

		// // need to check again for scopes after refreshing, in case a refresh token was passed without an access token
		return this._childProvider.getAccessToken(scopes);
		// return new AccessToken(
		// 	{
		// 		access_token: fullCreds.accessToken,
		// 		refresh_token: fullCreds.refreshToken,
		// 		expires_in: fullCreds.expiresIn,
		// 		scope: fullCreds.scopes
		// 	},
		// 	fullCreds.timestamp
		// );
	}

	/**
	 * Force a refresh of the access token.
	 */
	async refresh(): Promise<AccessToken> {
		const accessToken = (this._lastKnownAccessToken ?? (await this._childProvider.getAccessToken()))?.accessToken;
		if (!accessToken) {
			throw new FatalProviderError('No available access token to refresh');
		}

		const fullCreds = await AbstractProvider.prototype.idempotentRefresh.call(this, accessToken);

		return new AccessToken(
			{
				access_token: fullCreds.accessToken,
				refresh_token: fullCreds.refreshToken,
				expires_in: fullCreds.expiresIn,
				scope: fullCreds.scopes
			},
			fullCreds.timestamp
		);
	}

	/** @private */
	setAccessToken(token: AccessToken): void {
		this._lastKnownAccessToken = token;
		this._childProvider.setAccessToken(token);
	}

	/**
	 * The client ID.
	 */
	get clientId(): string {
		return this._childProvider.clientId;
	}

	/**
	 * The scopes that are currently available using the access token.
	 */
	get currentScopes(): string[] {
		return this._childProvider.currentScopes;
	}
}
