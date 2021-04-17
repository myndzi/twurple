import type { AbstractProvider } from '../AbstractProvider';

// integration example...
interface SomethingClientOpts {
	authProvider: AbstractProvider;
}

export class SomethingClient {
	authProvider: AbstractProvider;

	constructor({ authProvider }: SomethingClientOpts) {
		this.authProvider = authProvider;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async apiCall(): Promise<any> {
		const { clientId, accessToken } = await this.authProvider.fetch();
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return await this.fetch(clientId, accessToken);
		} catch (err) {
			if (err instanceof Error && err.message === 'got 400 response') {
				// retry once
				const { accessToken: refreshedToken } = await this.authProvider.idempotentRefresh(accessToken);
				return this.fetch(clientId, refreshedToken, true);
			}
			throw err;
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async fetch(clientId: string, accessToken: string, retried: boolean = false): Promise<any> {
		return fetch('https://foo.twitch.tv/bar', {
			headers: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				Authorization: `OAuth ${accessToken}`,
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Client-ID': clientId
			}
		}).then(async res => {
			// handle various status codes
			if (res.status >= 400 && res.status < 500) {
				// imagine a custom error or whatever you want to do
				if (!retried) {
					throw new Error('got 400 response');
				}
				throw new Error('i gave up');
			}
			return res.json();
		});
	}
}
