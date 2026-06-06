import { SetMetadata } from '@nestjs/common';
import { PersonnelRoles } from '@/core/auth/enums';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: PersonnelRoles[]) =>
	SetMetadata(ROLES_KEY, roles);
