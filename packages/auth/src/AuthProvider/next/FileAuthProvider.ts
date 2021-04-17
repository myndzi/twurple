import { promises as fs } from 'fs';
import { AbstractProvider } from '../AbstractProvider';
import type { ProviderConfig, RefreshableCredentials } from '../AbstractProvider';

// an in-memory non-refreshable provider seeded with static credentials in the constructor
export class FileAuthProvider extends AbstractProvider {
	private readonly path: string;

	constructor(path: string, config: ProviderConfig = {}) {
		super(config);

		this.path = path;
	}

	async loadCredentials(): Promise<RefreshableCredentials> {
		// probably needs to be some kind of validation...
		return JSON.parse(await fs.readFile(this.path, 'utf-8')) as RefreshableCredentials;
	}

	async saveCredentials(creds: RefreshableCredentials): Promise<void> {
		await fs.writeFile(this.path, JSON.stringify(creds));
	}
}
