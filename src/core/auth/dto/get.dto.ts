export class GetAuthDto {}

export interface LocalAuthUserPayload {
	sub: string;
	iss: string;
	aud: string;
}
