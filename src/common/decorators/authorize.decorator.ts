import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserType } from '@/core/auth/enums';

export const AUTHORIZE_KEY = 'authorize';
export const USER_TYPE_KEY = 'userType';

export const Secure = () => SetMetadata(AUTHORIZE_KEY, true);

export const Role = (userType: UserType) =>
	SetMetadata(USER_TYPE_KEY, userType);

export const Authorize = (userType: UserType) => {
	return applyDecorators(
		ApiBearerAuth('access-token'),
		Secure(),
		Role(userType),
	);
};
