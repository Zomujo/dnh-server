import {
	CallHandler,
	ExecutionContext,
	Logger,
	NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Logs each request's method, route pattern, status and duration — never
 * headers (bearer tokens), bodies (health readings, names, phone numbers,
 * passwords, OTPs) or the concrete URL (ids and query values). Outside
 * development these debug lines go to the external log service.
 */
export class TelemetryInterceptor implements NestInterceptor {
	private logger = new Logger(TelemetryInterceptor.name);
	intercept(
		context: ExecutionContext,
		next: CallHandler<any>,
	): Observable<any> | Promise<Observable<any>> {
		if (context.getType() !== 'http') return next.handle();

		const request: Request = context.switchToHttp().getRequest();
		const response: Response = context.switchToHttp().getResponse();
		const { method } = request;
		const path: string = request.route?.path ?? 'unmatched route';
		const beforeRequest = Date.now();

		return next
			.handle()
			.pipe(
				tap(() =>
					this.logger.debug(
						`Request completed ${method} ${path} - ${response.statusCode}`,
						{ duration: `${Date.now() - beforeRequest} ms` },
					),
				),
			);
	}
}
