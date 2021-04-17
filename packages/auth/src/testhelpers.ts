import type { AccessToken } from './AccessToken';

type AccessTokenArgs = ConstructorParameters<typeof AccessToken>;
export const unwrap = (at: AccessToken | null): AccessTokenArgs | null => {
	if (!at) {
		return null;
	}
	// the AccessToken class hides its data, so we have to cheat to get at it. the private data is not
	// enumerable, so snapshot tests won't be useful without unwrapping it
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any
	return [(at as any)._data, (at as any)._obtainmentDate];
};
