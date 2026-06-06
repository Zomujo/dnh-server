import { applyDecorators } from '@nestjs/common';
import {
	ApiCreatedResponse,
	ApiExtraModels,
	ApiOkResponse,
	getSchemaPath,
} from '@nestjs/swagger';
import {
	ApiSuccessResponseDto,
	ApiSuccessResponseNoData,
	ApiUpsertSuccessResponseDto,
} from '../dto';

export const ApiSuccessResponse = ({
	type,
	description,
	isArray = false,
}: {
	type: any;
	description: string;
	isArray?: boolean;
}) =>
	applyDecorators(
		ApiExtraModels(ApiSuccessResponseDto, type),
		ApiOkResponse({
			description,
			schema: {
				...(isArray
					? {
							allOf: [
								{ $ref: getSchemaPath(ApiSuccessResponseDto) },
								{
									properties: {
										data: {
											type: 'array',
											items: { $ref: getSchemaPath(type) },
										},
									},
								},
							],
						}
					: {
							allOf: [
								{ $ref: getSchemaPath(ApiSuccessResponseDto) },
								{
									properties: {
										data: {
											$ref: getSchemaPath(type),
										},
									},
								},
							],
						}),
			},
		}),
	);

export const ApiSuccessResponseNullData = ({
	description,
}: {
	description: string;
}) =>
	applyDecorators(
		ApiExtraModels(ApiSuccessResponseNoData),
		ApiOkResponse({
			description,
			schema: {
				allOf: [{ $ref: getSchemaPath(ApiSuccessResponseNoData) }],
			},
		}),
	);

export const ApiCreatedSuccessResponse = ({
	description,
}: {
	description: string;
}) =>
	applyDecorators(
		ApiExtraModels(ApiUpsertSuccessResponseDto),
		ApiCreatedResponse({
			description,
			schema: {
				allOf: [{ $ref: getSchemaPath(ApiUpsertSuccessResponseDto) }],
			},
		}),
	);

export const ApiUpdatedSuccessResponse = ({
	description,
}: {
	description: string;
}) =>
	applyDecorators(
		ApiExtraModels(ApiUpsertSuccessResponseDto),
		ApiOkResponse({
			description,
			schema: {
				allOf: [{ $ref: getSchemaPath(ApiUpsertSuccessResponseDto) }],
			},
		}),
	);

// export const ApiCreatedSuccessResponse = <T extends Type<unknown>>({
//   type,
//   description,
// }: {
//   type: T;
//   description: string;
// }) =>
//   applyDecorators(
//     ApiExtraModels(ApiSuccessResponseDto, type),
//     ApiCreatedResponse({
//       description,
//       schema: {
//         allOf: [
//           { $ref: getSchemaPath(ApiSuccessResponseDto) },
//           {
//             properties: {
//               data: {
//                 $ref: getSchemaPath(type),
//               },
//             },
//           },
//         ],
//       },
//     }),
//   );
