import { SomethingClient } from './Client';
import { RefreshableAuthProvider } from './RefreshableAuthProvider';

const authProvider = new RefreshableAuthProvider({
	clientId: 'foo',
	clientSecret: 'bar',
	accessToken: 'baz',
	refreshToken: 'quux'
});
const myClient = new SomethingClient({ authProvider });

async function main() {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const result = await myClient.apiCall();
	// eslint-disable-next-line no-console
	console.log(result);
}
void main();
