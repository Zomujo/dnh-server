import { UserType } from '@/core/auth/enums';

/**
 * Set by AuthGuard on a route that requires a token (to the token
 * audience it requires), before it verifies the token. Lets the audit
 * trail record requests the guards reject, which never reach interceptors.
 */
export const AUDIT_AUTH_REQUIRED = Symbol('audit:auth-required');

/** Set by AuditInterceptor once a request reaches it. */
export const AUDIT_INTERCEPTED = Symbol('audit:intercepted');

export interface AuditMarkedRequest {
	[AUDIT_AUTH_REQUIRED]?: UserType;
	[AUDIT_INTERCEPTED]?: boolean;
}

export function markAuthRequired(request: object, userType: UserType) {
	(request as AuditMarkedRequest)[AUDIT_AUTH_REQUIRED] = userType;
}
