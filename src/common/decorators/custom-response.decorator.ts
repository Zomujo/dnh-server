import { applyDecorators } from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiConflictResponse,
	ApiForbiddenResponse,
	ApiInternalServerErrorResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserType } from '@/core/auth/enums';
import { ApiErrorResponse } from '../dto';
import {
	HandleCreate,
	HandleSuccess,
	HandleSuccessNull,
	HandleUpdate,
} from '../interceptors/handler-wrappers';
import { Authorize } from './authorize.decorator';
import { ApiOkResponsePaginated } from './paginated-success.decorator';
import {
	ApiCreatedSuccessResponse,
	ApiSuccessResponse,
	ApiSuccessResponseNullData,
	ApiUpdatedSuccessResponse,
} from './response.decorators';

export function CustomApiResponse(
	responseTypes: CustomResponses[],
	options: { type?: any; message?: string; isArray?: boolean },
) {
	const docs = [
		ApiBadRequestResponse({
			type: ApiErrorResponse,
			description: 'Validation error occurred',
		}),
		ApiInternalServerErrorResponse({
			type: ApiErrorResponse,
			description: 'An unexpected error occurred',
		}),
		ApiConflictResponse({
			type: ApiErrorResponse,
			description: 'Conflict error occurred',
		}),
	];
	responseTypes.forEach((response) => {
		switch (response) {
			case 'created':
				docs.push(
					ApiCreatedSuccessResponse({
						description: options.message || 'Request successful',
					}),
					HandleCreate(),
				);
				break;
			case 'updated':
				docs.push(
					ApiUpdatedSuccessResponse({
						description: options.message || 'Update request successful',
					}),
					HandleUpdate(),
				);
				break;
			case 'success':
				docs.push(
					ApiSuccessResponse({
						type: options.type ?? 'any',
						description: options.message || 'Request successful',
						isArray: options.isArray,
					}),
					HandleSuccess(),
				);
				break;
			case 'successNull':
				docs.push(
					ApiSuccessResponseNullData({
						description: options.message || 'Request successful',
					}),
					HandleSuccessNull(),
				);
				break;
			case 'successNoWrap':
				docs.push(
					ApiOkResponse({
						type: options.type ?? 'any',
						description: options.message || 'Request successful',
						isArray: options.isArray,
					}),
				);
				break;
			case 'paginated':
				docs.push(
					ApiOkResponsePaginated({
						type: options.type,
						description: options.message || 'Resources retrieved successfully',
					}),
					HandleSuccess(),
				);
				break;
			case 'authorize':
				docs.push(
					...[
						ApiUnauthorizedResponse({
							type: ApiErrorResponse,
							description: 'Unauthorized access.Zyptyk Client Token Required',
						}),
						Authorize(UserType.DH_CLIENTS),
					],
				);
				break;
			case 'authorizeChronicCare':
				docs.push(
					...[
						ApiUnauthorizedResponse({
							type: ApiErrorResponse,
							description: 'Unauthorized access Chronic Care Token Required.',
						}),
						ApiForbiddenResponse({
							type: ApiErrorResponse,
							description: 'Forbidden access. Chronic Care Token Required.',
						}),
						Authorize(UserType.CHRONIC_CARE),
					],
				);
				break;
			case 'notfound':
				docs.push(
					ApiNotFoundResponse({
						type: ApiErrorResponse,
						description: 'Resource not found',
					}),
				);
				break;
		}
	});

	return applyDecorators(...docs);
}

export type CustomResponses =
	| 'created'
	| 'updated'
	| 'success'
	| 'successNull'
	| 'successNoWrap'
	| 'authorize'
	| 'authorizeChronicCare'
	| 'paginated'
	| 'notfound';
