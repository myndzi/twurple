import { AbstractProvider } from '../AbstractProvider';
import type { ProviderConfig, LoadableCredentials } from '../AbstractProvider';

// an in-memory refreshable provider seeded with static credentials in the constructor
// there isn't really any difference between this and StaticAuthProvider, more type
// wrangling needs to be had to make the constructor stricter here
export class RefreshableAuthProvider extends AbstractProvider {
	private readonly initialCredentials: LoadableCredentials;

	constructor(credentials: LoadableCredentials, config: ProviderConfig = {}) {
		super(config);

		// maybe pull this out to AbstractProvider as a constructor argument...
		this.initialCredentials = credentials;
	}

	async loadCredentials(): Promise<LoadableCredentials> {
		return this.initialCredentials;
	}

	async saveCredentials(): Promise<void> {
		// noop
	}
}
