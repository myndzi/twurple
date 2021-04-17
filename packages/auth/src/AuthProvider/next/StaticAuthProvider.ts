import { AbstractProvider } from '../AbstractProvider';
import type { ProviderConfig, LoadableCredentials } from '../AbstractProvider';

// an in-memory non-refreshable provider seeded with static credentials in the constructor
export class StaticAuthProvider extends AbstractProvider {
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
