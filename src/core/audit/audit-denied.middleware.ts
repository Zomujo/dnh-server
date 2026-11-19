import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
	AUDIT_AUTH_REQUIRED,
	AUDIT_INTERCEPTED,
	type AuditMarkedRequest,
} from './audit.markers';
import { AuditService } from './audit.service';
import {
	type AuditRequest,
	actorFromRequest,
	buildAuditEntry,
	routeTemplate,
} from './audit-rules';
import { AuditAction } from './entities/audit-log.entity';

const DENIED_STATUSES = new Set([401, 403]);

/**
 * Records requests to token-protected routes that AuthGuard or RolesGuard
 * rejected with 401/403. Guards run before interceptors, so
 * AuditInterceptor never sees these.
 *
 * A request counts when AuthGuard marked the route as requiring a token
 * and the request never reached AuditInterceptor. The actor is known only
 * when the token was valid and the role check failed; a missing, expired
 * or forged token is recorded as anonymous. No token or body is stored.
 */
@Injectable()
export class AuditDeniedMiddleware implements NestMiddleware {
	private readonly logger = new Logger(AuditDeniedMiddleware.name);

	constructor(private readonly auditService: AuditService) {}

	use(request: Request, response: Response, next: NextFunction) {
		response.once('finish', () => {
			try {
				this.recordIfDenied(
					request as unknown as AuditRequest & AuditMarkedRequest,
					response.statusCode,
				);
			} catch (error) {
				this.logger.error(
					'Could not record denied request',
					error instanceof Error ? error.stack : String(error),
				);
			}
		});
		next();
	}

	recordIfDenied(
		request: AuditRequest & AuditMarkedRequest,
		statusCode: number,
	) {
		const userType = request[AUDIT_AUTH_REQUIRED];
		if (!userType || request[AUDIT_INTERCEPTED]) return;
		if (!DENIED_STATUSES.has(statusCode)) return;

		const route = routeTemplate(request);
		if (!route) return;

		this.auditService.record(
			buildAuditEntry({
				request,
				route,
				action: AuditAction.ACCESS_DENIED,
				actor: actorFromRequest(request.user, userType),
				statusCode,
			}),
		);
	}
}
