import {
	CallHandler,
	ExecutionContext,
	HttpException,
	Injectable,
	Logger,
	NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';
import { USER_TYPE_KEY } from '@/common/decorators';
import { UserType } from '@/core/auth/enums';
import { AuditService } from './audit.service';
import {
	type AuditRequest,
	actorForAuthEvent,
	actorFromRequest,
	auditActionFor,
	buildAuditEntry,
	routeTemplate,
} from './audit-rules';

/**
 * Records an audit entry for each audited request (see `auditActionFor`).
 *
 * The entry is written once the response has gone out (`finish`/`close`),
 * so it carries the real status code, including errors mapped by Nest's
 * exception handling. The stream is never altered: errors pass through
 * untouched and nothing here can throw into the request.
 *
 * Interceptors run after guards, so requests rejected by AuthGuard or
 * RolesGuard (401/403) are not recorded here.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
	private readonly logger = new Logger(AuditInterceptor.name);

	constructor(
		private readonly auditService: AuditService,
		private readonly reflector: Reflector,
	) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		if (context.getType() !== 'http') return next.handle();

		let observe: Partial<{
			next: (body: unknown) => void;
			error: (error: unknown) => void;
		}> = {};
		try {
			observe = this.watch(context) ?? {};
		} catch (error) {
			this.logFailure(error);
		}

		return next.handle().pipe(
			tap({
				next: (body) => observe.next?.(body),
				error: (error) => observe.error?.(error),
			}),
		);
	}

	/**
	 * Decides whether the request is audited and, if so, arranges for the
	 * entry to be written when the response ends. Returns the hooks that
	 * capture the handler's result (for auth event ids) or error.
	 */
	private watch(context: ExecutionContext) {
		const http = context.switchToHttp();
		const request = http.getRequest<AuditRequest>();
		const response = http.getResponse<Response>();

		const route = routeTemplate(request);
		if (!route) return undefined;

		const userType = this.reflector.getAllAndOverride<UserType | undefined>(
			USER_TYPE_KEY,
			[context.getHandler(), context.getClass()],
		);
		const actor = actorFromRequest(request.user, userType);
		const action = auditActionFor(request.method, route, actor);
		if (!action) return undefined;

		let responseBody: unknown;
		let errorStatus: number | undefined;
		let written = false;

		const write = () => {
			if (written) return;
			written = true;
			response.off?.('finish', write);
			response.off?.('close', write);
			try {
				// Closed before the error response went out (client hung up):
				// fall back to the status the error would have produced.
				const statusCode =
					!response.headersSent && errorStatus !== undefined
						? errorStatus
						: response.statusCode;
				this.auditService.record(
					buildAuditEntry({
						request,
						route,
						action,
						actor: actorForAuthEvent(
							request.method,
							route,
							actor,
							statusCode < 400 ? responseBody : undefined,
						),
						statusCode,
					}),
				);
			} catch (error) {
				this.logFailure(error);
			}
		};

		response.once('finish', write);
		response.once('close', write);

		return {
			next: (body: unknown) => {
				responseBody = body;
			},
			error: (error: unknown) => {
				errorStatus = error instanceof HttpException ? error.getStatus() : 500;
			},
		};
	}

	private logFailure(error: unknown) {
		this.logger.error(
			'Could not record audit entry',
			error instanceof Error ? error.stack : String(error),
		);
	}
}
