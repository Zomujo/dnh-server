import {
	applyDecorators,
	CallHandler,
	ExecutionContext,
	HttpStatus,
	Injectable,
	Logger,
	NestInterceptor,
	UseInterceptors,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
	ApiSuccessResponseNoData,
	throwError as customThrowErr,
} from '@/common/dto';

@Injectable()
export class SuccessNullActionInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const className = context.getClass().name;
		const resource = className.replace('Controller', '');
		const logger = new Logger(className);

		return next.handle().pipe(
			map(
				() =>
					new ApiSuccessResponseNoData(
						HttpStatus.OK,
						`${resource}ActionSuccessful`,
					),
			),
			catchError((err) => throwError(() => customThrowErr(logger, err))),
		);
	}
}

export function HandleSuccessNull() {
	return applyDecorators(UseInterceptors(SuccessNullActionInterceptor));
}
