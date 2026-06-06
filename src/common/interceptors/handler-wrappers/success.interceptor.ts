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
	ApiSuccessResponseDto,
	throwError as customThrowErr,
} from '@/common/dto';

@Injectable()
export class SuccessActionInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const className = context.getClass().name;
		const resource = className.replace('Controller', '');
		const logger = new Logger(className);

		return next.handle().pipe(
			map(
				(response) =>
					new ApiSuccessResponseDto(
						response,
						HttpStatus.OK,
						`${resource}DataRetrievalSuccessful`,
					),
			),
			catchError((err) => throwError(() => customThrowErr(logger, err))),
		);
	}
}

export function HandleSuccess() {
	return applyDecorators(UseInterceptors(SuccessActionInterceptor));
}
