import { UserType } from '../../auth/enums';

export interface IUserPayload {
	iss?: string;
	aud?: UserType;
	auth_time?: number;
	user_id?: string;
	sub?: string;
	iat?: number;
	exp?: number;
	email?: string;
	email_verified?: boolean;
	firebase?: {
		identities: {
			email: string[];
		};
		sign_in_provider?: string;
	};
	uid?: string;
}
