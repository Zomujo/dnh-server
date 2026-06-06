import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';

export const GetTherapist = createParamDecorator(
	(data: Payload, ctx: ExecutionContext) => {
		const request = ctx.switchToHttp().getRequest();
		const therapist = request.therapist;

		return data ? therapist?.[data] : therapist;
	},
);

type Payload =
	| 'iss'
	| 'aud'
	| 'auth_time'
	| 'user_id'
	| 'sub'
	| 'iat'
	| 'exp'
	| 'email'
	| 'email_verified'
	| 'firebase'
	| 'uid';
