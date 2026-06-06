import type { Type } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginatedDataResponseDto } from '../dto';

export const ApiOkResponsePaginated = <T extends Type<unknown>>({
	type,
	description,
}: {
	type: T;
	description: string;
}) =>
	applyDecorators(
		ApiExtraModels(PaginatedDataResponseDto, type),
		ApiOkResponse({
			description,
			schema: {
				allOf: [
					{
						properties: {
							data: {
								properties: {
									rows: {
										type: 'array',
										items: { $ref: getSchemaPath(type) },
									},
									total: {
										type: 'integer',
										example: 100,
									},
									pageSize: {
										type: 'integer',
										example: 10,
									},
									page: {
										type: 'integer',
										example: 1,
									},
									nextPage: {
										type: 'integer',
										example: 2,
									},
									prevPage: {
										type: 'integer',
										example: null,
									},
									totalPages: {
										type: 'integer',
										example: 10,
									},
								},
								type: 'object',
							},
							statusCode: {
								type: 'integer',
								example: 200,
							},
							message: {
								type: 'string',
								example: 'resources retrieved successfully',
							},
						},
						type: 'object',
					},
				],
			},
		}),
	);
