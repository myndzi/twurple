import { FatalProviderError } from '../Errors/FatalProviderError';
import { refreshUserToken } from '../helpers';
import type { Logger } from '@d-fischer/logger';
import type { AccessTokenData } from '../AccessToken';
import { AbstractStaticProvider } from './AbstractStaticProvider';

/**
 * Credentials holds all data relevant to making API calls or refreshing access tokens.
 *
 * This type is internal-use only: it defines the shape of the internal state. The various
 * `FooCredentials` types define the interface to external collers
 */
export interface RefreshableCredentials {
	clientId: string;
	accessToken: string;
	clientSecret: string;
	refreshToken: string;
	scopes: string[];
	expiryDate: Date | null;

	// to be able to instantiate an AccessToken, we must store these values too
	expiresIn: number;
	timestamp: Date;
}

type RequiredFields = 'clientId' | 'clientSecret' | 'accessToken' | 'refreshToken';
export type LoadableRefreshableCredentials = Required<Pick<RefreshableCredentials, RequiredFields>> &
	Partial<Omit<RefreshableCredentials, RequiredFields>>;

/**
 * ProviderConfig contains options that govern refresh behavior of an AbstractProvider
 * implementation.
 */
export interface RefreshableProviderConfig {
	/**
	 * If credentials are within `refreshPadding` **milliseconds**
	 * of expiring, perform a refresh. This should reduce the chance
	 * of having to retry after a failed request.
	 */
	refreshPadding?: number;

	/**
	 * Delete old entries from the refresh chain once their expiration
	 * is larger than `expiryAge` **seconds** ago. The refresh chain
	 * maintains a map of old access tokens to newer credentials that
	 * were refreshed from the old token.
	 */
	expiryAge?: number;

	/**
	 * Logger instance to use. Strongly recommended: the only log
	 * message is a potentially crucial error that doesn't prevent
	 * normal operation in the short term
	 */
	logger?: Logger;
}

/**
 * AbstractProvider wires together an optionally-asynchronous data store with the
 * ability to hold and request a current, canonical, credential set. It must be
 * extended by specific implementations, such as a database or flat file store.
 *
 * The class maintains a "refresh map", which is a map of old access tokens to
 * newer credential sets, providing a layer of idempotency to the refresh process.
 */
export abstract class AbstractRefreshableProvider extends AbstractStaticProvider {
	protected logger?: Logger;
	protected readonly refreshMap: Map<string, Promise<RefreshableCredentials> | RefreshableCredentials>;
	protected readonly refreshPadding: number;
	protected readonly expiryAge: number;

	constructor({ refreshPadding = 500, expiryAge = 86400, ...config }: RefreshableProviderConfig = {}) {
		super(config);
		this.refreshPadding = refreshPadding;
		this.expiryAge = expiryAge;

		this.refreshMap = new Map<string, RefreshableCredentials>();

		// prune the refreshMap every 5 minutes
		setInterval(async () => this.prune(), 300 * 1000).unref();
	}

	/**
	 * Returns a promise for the current API credentials. Automatically
	 * refreshes if needed.
	 */
	async fetch(): Promise<RefreshableCredentials> {
		const now = new Date().getTime();

		const fullCreds = (await this.credentials) as RefreshableCredentials;
		const { accessToken, expiryDate } = fullCreds;

		// if expiryDate is set, check it for expiration
		if (expiryDate !== null) {
			const expiresInMs = expiryDate.getTime() - now - this.refreshPadding;
			if (expiresInMs <= 0) {
				// automatically refresh if we're within `refreshPadding` milliseconds of expiring
				if (fullCreds.clientSecret && fullCreds.refreshToken) {
					return this.idempotentRefresh(accessToken);
				}
				// the credentials have expired and there's no refresh info, raise a reasonable error
				throw new FatalProviderError('Static credentials have expired');
			}
		}

		// otherwise, return what we already have...
		return fullCreds;
	}

	/**
	 * Idempotently refreshes the credentials. Calls `this.saveCredentials` to persist
	 * the result. Returns the new credentials
	 *
	 * @param oldAccessToken The previous access token being refreshed
	 */
	async idempotentRefresh(oldAccessToken: string): Promise<RefreshableCredentials> {
		// if we have a record of a previous refresh request with this token:
		// return whatever we returned last time. we could do this iteratively, but
		// it doesn't seem worth the complexity. if the credentials returned here
		// don't work, they can try calling refresh again to get the next in the
		// sequence
		const idempotentCreds = this.refreshMap.get(oldAccessToken);
		if (idempotentCreds) {
			return idempotentCreds;
		}

		// if we don't have a previous refresh in the map, we'll need to create
		// a new one for this `oldAccessToken`. All code below here _must_ be
		// synchronous (no await!) or else concurrent calls will not reuse
		// the same promises.
		const refreshPromise = this.credentials
			.then(async _fullCreds => {
				const fullCreds = _fullCreds as RefreshableCredentials;

				// we check for this in `.fetch()`, but a user could call this method explicitly,
				// so we need to check here too
				if (!fullCreds.clientSecret) {
					throw new FatalProviderError('No clientSecret was supplied, cannot refresh credentials');
				}
				if (!fullCreds.refreshToken) {
					throw new FatalProviderError('No refreshToken was supplied, cannot refresh credentials');
				}
				// if the accessToken matches the current credentials, they should be
				// refreshed. if it doesn't, we don't know what to do -- they could
				// be bogus, really old, or we could have restarted and lost some
				// state, loading old credentials on start.
				if (fullCreds.accessToken !== oldAccessToken) {
					// the access token is too old, or we've lost the history (it expired, or
					// we restarted the process). we could just return the current credentials,
					// but that would be leaky. Instead, throw an error -- the user can retry
					// with .fetch() if they want the latest credentials.
					throw new FatalProviderError('Refresh was called with a stale or unknown access token');
				}

				// if we've arrived here, the access token matches the latest credentials we
				// have. refresh those credentials. we must atomically replace `this.credentials`
				// with a new promise resulting in the refreshed credentials, so that any
				// asynchronous calls to `fetch` while we're doing this will resolve correctly.
				// we must also add this request to the refresh map so that asynchronous calls
				// to `refresh` with the current (soon to be old) accessToken return a consistent
				// result.
				const newAccessToken = await refreshUserToken(
					fullCreds.clientId,
					fullCreds.clientSecret,
					fullCreds.refreshToken
				);

				if (newAccessToken.expiryDate === null) {
					// Refresh calls should always return an `expires_in` argument. However, the implementation
					// of AccessToken is designed to accept an optional value here (for e.g. static credentials,
					// or credentials which should be immediately refreshed). If we don't assert here, we can't
					// provide the stronger type-guarantee of a never-null value of expiryDate on the Credentials
					// type.
					throw new FatalProviderError('refreshUserToken did not return an expiryDate');
				}

				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-explicit-any
				const expiresIn = ((newAccessToken as any)._data as AccessTokenData).expires_in;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-explicit-any
				const timestamp = (newAccessToken as any)._obtainmentDate as Date;

				if (typeof expiresIn !== 'number') {
					// more validation to ensure we can rely on our types...
					throw new FatalProviderError('Twitch API did not return `expires_in`');
				}
				if (!(timestamp instanceof Date)) {
					throw new FatalProviderError('Internal error: no obtainmentDate from AccessToken');
				}

				// map the getter-based interface to plain data
				const newCreds: RefreshableCredentials = {
					clientId: fullCreds.clientId,
					clientSecret: fullCreds.clientSecret,
					accessToken: newAccessToken.accessToken,
					expiryDate: newAccessToken.expiryDate,
					refreshToken: newAccessToken.refreshToken,
					scopes: newAccessToken.scope,
					expiresIn,
					timestamp
				};

				// to avoid having to loop over and resolve all the promises, it's more convenient
				// to store the static / result values in the map instead. when we have a value,
				// update the map to hold the static value instead of the promise, so that we
				// can more easily expire entries
				this.refreshMap.set(oldAccessToken, newCreds);

				// saving the credentials does not need to be done synchronously before we can return
				// the new credentials to the caller. indeed, it can fail, but the credentials would
				// still be valid. in such a case, we log a message and attempt to call save every
				// so often when using `.fetch()`, in an attempt to recover from an ephemeral failure
				// (e.g. a network partition or external service that was restarted)
				void this.trySaveCredentials(newCreds);

				return newCreds;
			})
			.catch(err => {
				// if we failed in some way, remove the promise from `this.refreshMap`. this will
				// cause any code that attempts to refresh that same old access token to go through
				// the whole refresh flow again. this is probably okay: a user can react to the
				// promise rejection and invalidate the access token they're trying to refresh,
				// or choose to retry again.
				this.refreshMap.delete(oldAccessToken);
				const emsg = err instanceof Error ? `: ${err.message}` : '';
				this.logger?.error(`Refresh request failed${emsg}: removed from refreshMap`);

				// rethrow so the promise actually does reject
				throw err;
			});

		this.credentials = refreshPromise;

		// while this promise is resolving, other callers may attempt to refresh. return
		// the same promise to them, so they get the same value
		this.refreshMap.set(oldAccessToken, refreshPromise);

		return refreshPromise;
	}

	abstract loadCredentials(): Promise<LoadableRefreshableCredentials>;
	abstract saveCredentials(creds: RefreshableCredentials): Promise<void>;

	/**
	 * Wraps the abstract `saveCredentials` method with wiring to retry saving over
	 * time if it failed
	 *
	 * @param creds full credentials to save
	 */
	private async trySaveCredentials(creds: RefreshableCredentials): Promise<void> {
		// if we are unable to save these new credentials, we are in a pickle. the old
		// accessToken may be invalid now, but the old refreshToken can be valid for
		// longer. in order to keep the application functioning, we'll return the new
		// credentials, but they won't have been saved; on next start, the old credentials
		// will be loaded, refreshed, and hopefully the refresh will work.
		try {
			await this.saveCredentials(creds);
		} catch (e) {
			// ideally, the implementor catches errors and surfaces them however appropriate.
			// this is a final backstop to make some noise on the console/logs that something
			// was broken.
			const emsg = e instanceof Error ? `: ${e.message}` : '';
			this.logger?.error(
				`Failed to save new OAuth credentials${emsg}: authentication may break unless the problem is corrected`
			);
		}
	}

	/**
	 * Removes *non-promise* entries from `this.refreshMap` that are older than `expiryAge`
	 * seconds from the current timestamp. Promises are expected to become static values
	 * or be removed if they rejected
	 */
	private async prune() {
		const threshold = new Date();
		threshold.setSeconds(threshold.getSeconds() - this.expiryAge);

		for (const [key, creds] of this.refreshMap.entries()) {
			if (
				!(creds instanceof Promise) &&
				creds.expiryDate !== null &&
				creds.expiryDate.getTime() < threshold.getTime()
			) {
				this.refreshMap.delete(key);
			}
		}
	}
}
