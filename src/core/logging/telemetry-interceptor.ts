import {
	CallHandler,
	ExecutionContext,
	Logger,
	NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { NodeEnvs } from '@/common/enums';

export class TelemetryInterceptor implements NestInterceptor {
	private logger = new Logger(TelemetryInterceptor.name);
	intercept(
		context: ExecutionContext,
		next: CallHandler<any>,
	): Observable<any> | Promise<Observable<any>> {
		const request: Request = context.switchToHttp().getRequest();
		const response: Response = context.switchToHttp().getResponse();

		const { method, route, url, headers, body } = request;
		const isDevelopment =
			(process.env.NODE_ENV as NodeEnvs) === NodeEnvs.DEVELOPMENT;
		if (!isDevelopment) {
			this.logger.debug(`Request: ${method} ${route.path}`, {
				method,
				url,
				headers,
				body,
			});
		}
		const beforeRequest = Date.now();

		return next.handle().pipe(
			tap(() =>
				this.logger.debug(
					`Request completed  ${route.path} - ${response.statusCode}`,
					{
						duration: `${Date.now() - beforeRequest} ms`,
						statusCode: response.statusCode,
					},
				),
			),
		);
	}
}
