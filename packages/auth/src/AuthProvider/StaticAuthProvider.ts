import { Enumerable } from '@d-fischer/shared-utils';
import { rtfm } from '@twurple/common';
import { AccessToken } from '../AccessToken';
import { FatalProviderError } from '../Errors/FatalProviderError';
import { AbstractProvider } from './AbstractProvider';
import type { LoadableCredentials } from './AbstractProvider';
import type { AuthProvider, AuthProviderTokenType } from './AuthProvider';

/**
 * An auth provider that always returns the same initially given credentials.
 *
 * You are advised to roll your own auth provider that can handle scope upgrades,
 * or to plan ahead and supply only access tokens that account for all scopes
 * you will ever need.
 */
@rtfm<StaticAuthProvider>('auth', 'StaticAuthProvider', 'clientId')
export class StaticAuthProvider extends AbstractProvider implements AuthProvider {
	@Enumerable(false) private readonly _clientId: string;
	@Enumerable(false) private _accessToken?: AccessToken;
	private _scopes?: string[];

	/**
	 * The type of token the provider holds.
	 */
	readonly tokenType: AuthProviderTokenType;

	/**
	 * Creates a new auth provider with static credentials.
	 *
	 * @param clientId The client ID.
	 * @param accessToken The access token to provide.
	 *
	 * You need to obtain one using one of the [Twitch OAuth flows](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/).
	 * @param scopes The scopes the supplied token has.
	 * @param tokenType The type of the supplied token.
	 */
	constructor(
		clientId: string,
		accessToken?: string | AccessToken,
		scopes?: string[],
		tokenType: AuthProviderTokenType = 'user'
	) {
		super();

		this._clientId = clientId || '';
		this.tokenType = tokenType;
		if (accessToken) {
			this._accessToken =
				typeof accessToken === 'string'
					? new AccessToken({
							access_token: accessToken,
							scope: scopes,
							refresh_token: ''
					  })
					: accessToken;
			this._scopes = scopes;
		}
	}

	async saveCredentials(): Promise<void> {
		throw new FatalProviderError('StaticAuthProvider cannot save credentials');
	}

	async loadCredentials(): Promise<LoadableCredentials> {
		const accessToken = this._accessToken?.accessToken;

		if (typeof accessToken !== 'string') {
			throw new FatalProviderError('Child provider returned a null accessToken');
		}
		if (this._clientId === '') {
			throw new FatalProviderError('Empty clientId given');
		}

		return {
			clientId: this.clientId,
			accessToken: accessToken
		};
	}

	/**
	 * Retrieves an access token.
	 *
	 * If the current access token does not have the requested scopes, this method throws.
	 * This makes supplying an access token with the correct scopes from the beginning necessary.
	 *
	 * @param scopes The requested scopes.
	 */
	async getAccessToken(): Promise<AccessToken | null> {
		const fullCreds = await this.fetch();
		this._accessToken = new AccessToken({
			access_token: fullCreds.accessToken,
			refresh_token: '',
			expires_in: fullCreds.expiresIn,
			scope: fullCreds.scopes
		});
		this._scopes = fullCreds.scopes;
		return this._accessToken;
	}

	/** @private */
	setAccessToken(token: AccessToken): void {
		this._accessToken = token;
	}

	/**
	 * The client ID.
	 */
	get clientId(): string {
		return this._clientId;
	}

	/**
	 * The scopes that are currently available using the access token.
	 */
	get currentScopes(): string[] {
		return this._scopes ?? [];
	}
}
