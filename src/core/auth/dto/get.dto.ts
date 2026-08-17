export class GetAuthDto {}

export interface LocalAuthUserPayload {
	sub: string;
	iss: string;
	aud: string;
	facility?: string;
	iat?: number;
}
