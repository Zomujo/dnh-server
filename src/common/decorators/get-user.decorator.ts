import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';

export const GetUser = createParamDecorator(
	(data: Payload, ctx: ExecutionContext) => {
		const request = ctx.switchToHttp().getRequest();
		const user = request.user;

		return data ? user?.[data] : user;
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
