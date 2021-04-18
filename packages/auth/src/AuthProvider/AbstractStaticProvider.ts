import { FatalProviderError } from '../Errors/FatalProviderError';
import { getTokenInfo } from '../helpers';
import type { Logger } from '@d-fischer/logger';

/**
 * Credentials holds all data relevant to making API calls or refreshing access tokens.
 *
 * This type is internal-use only: it defines the shape of the internal state. The various
 * `FooCredentials` types define the interface to external collers
 */
export interface StaticCredentials {
	clientId: string;
	accessToken: string;
	scopes: string[];
	expiryDate: Date | null;
}

type RequiredFields = 'clientId' | 'accessToken';
export type LoadableStaticCredentials = Required<Pick<StaticCredentials, RequiredFields>> &
	Partial<Omit<StaticCredentials, RequiredFields>>;

/**
 * ProviderConfig contains options that govern refresh behavior of an AbstractProvider
 * implementation.
 */
export interface StaticProviderConfig {
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
export abstract class AbstractStaticProvider {
	protected logger?: Logger;
	protected credentials: Promise<StaticCredentials>;

	constructor({ logger = undefined }: StaticProviderConfig = {}) {
		this.logger = logger;

		// this.credentials is non-optional, but we don't want to call this.loadCredentials until
		// after the subclass's constructor is complete. delay it a turn of the event loop by
		// wrapping the call to this.initCredentials in a promise...
		this.credentials = new Promise(resolve => setImmediate(resolve)).then(async () => this.initCredentials());
	}

	/**
	 * Returns a promise for the current API credentials. Automatically
	 * refreshes if needed.
	 */
	async fetch(): Promise<StaticCredentials> {
		return this.credentials;
	}

	abstract loadCredentials(): Promise<LoadableStaticCredentials>;

	protected async initCredentials(): Promise<StaticCredentials> {
		const creds = await this.loadCredentials();
		if (!creds.scopes || !Object.prototype.hasOwnProperty.call(creds, 'expiryDate')) {
			const tokenInfo = await getTokenInfo(creds.accessToken, creds.clientId);
			Object.assign(creds, {
				scopes: tokenInfo.scopes,
				// expires_in from the twitch api can be missing, which means the token is
				// permanently valid(?) -- represent this as null, since we can't have a
				// new Date(Infinity)
				expiryDate: tokenInfo.expiryDate ?? null
			});
		}

		// ensure our type safety holds...
		if (!Array.isArray(creds.scopes)) {
			throw new FatalProviderError('Failed to hydrate missing data from the Twitch API');
		}

		return creds as StaticCredentials;
	}
}
