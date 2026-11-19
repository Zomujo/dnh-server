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
import { finalize, Observable, tap } from 'rxjs';
import { USER_TYPE_KEY } from '@/common/decorators';
import { UserType } from '@/core/auth/enums';
import { AUDIT_INTERCEPTED, type AuditMarkedRequest } from './audit.markers';
import { AuditService } from './audit.service';
import {
	type AuditRequest,
	actorForAuthEvent,
	actorFromRequest,
	auditActionFor,
	buildAuditEntry,
	routeTemplate,
} from './audit-rules';
import { AuditOutcome } from './entities/audit-log.entity';

interface Hooks {
	next(body: unknown): void;
	error(error: unknown): void;
	settled(): void;
}

/**
 * Records an audit entry for each audited request (see `auditActionFor`).
 *
 * Normally the entry is written when the response finishes, so it carries
 * the status code actually sent, including errors mapped by Nest's
 * exception handling. If the client disconnects first, the entry waits
 * for the handler to settle: an error is recorded with its status, and a
 * handler that completes is recorded as `aborted` with no status.
 *
 * The stream is only observed: errors pass through untouched and nothing
 * here can throw into the request. Requests rejected by the guards never
 * reach interceptors; AuditDeniedMiddleware records those.
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

		let hooks: Hooks | undefined;
		try {
			hooks = this.watch(context);
		} catch (error) {
			this.logFailure(error);
		}
		if (!hooks) return next.handle();
		const { next: onNext, error: onError, settled } = hooks;

		return next
			.handle()
			.pipe(tap({ next: onNext, error: onError }), finalize(settled));
	}

	/**
	 * Decides whether the request is audited and, if so, arranges for the
	 * entry to be written. Returns the hooks that observe the handler.
	 */
	private watch(context: ExecutionContext): Hooks | undefined {
		const http = context.switchToHttp();
		const request = http.getRequest<AuditRequest & AuditMarkedRequest>();
		const response = http.getResponse<Response>();
		request[AUDIT_INTERCEPTED] = true;

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
		let settled = false;
		let aborted = false;
		let written = false;

		const write = (statusCode: number | undefined, outcome?: AuditOutcome) => {
			if (written) return;
			written = true;
			response.off?.('finish', onFinish);
			response.off?.('close', onClose);
			try {
				this.auditService.record(
					buildAuditEntry({
						request,
						route,
						action,
						actor: actorForAuthEvent(
							request.method,
							route,
							actor,
							statusCode !== undefined && statusCode < 400
								? responseBody
								: undefined,
						),
						statusCode,
						outcome,
					}),
				);
			} catch (error) {
				this.logFailure(error);
			}
		};

		// Client gone before a response went out: the status code on the
		// response object is just the default, so use the handler's result.
		const writeAborted = () => {
			if (errorStatus !== undefined) write(errorStatus);
			else write(undefined, AuditOutcome.ABORTED);
		};

		const onFinish = () => write(response.statusCode);
		const onClose = () => {
			if (response.writableFinished) return onFinish();
			aborted = true;
			if (settled) writeAborted();
		};

		response.once('finish', onFinish);
		response.once('close', onClose);

		return {
			next: (body) => {
				responseBody = body;
			},
			error: (error) => {
				errorStatus = error instanceof HttpException ? error.getStatus() : 500;
			},
			settled: () => {
				settled = true;
				try {
					if (aborted) writeAborted();
				} catch (error) {
					this.logFailure(error);
				}
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
