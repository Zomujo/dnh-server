import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsDate,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	Min,
} from 'class-validator';
import { IsGreaterThan } from '../decorators/validators';

export class PaginationRequestDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	search?: string;

	@ApiPropertyOptional({
		description: 'The fields to be searched in',
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Transform(({ value }) => (Array.isArray(value) ? value : [value]))
	searchFields?: string[];

	@ApiPropertyOptional({
		description: 'The fields to be returned',
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Transform(({ value }) => (Array.isArray(value) ? value : [value]))
	fields?: string[];

	@ApiPropertyOptional()
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page: number;

	@ApiPropertyOptional({ default: 10 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	pageSize: number = 10;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	orderBy?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsIn(['ASC', 'DESC', 'asc', 'desc'])
	orderDirection?: string = 'DESC';

	@ApiPropertyOptional({
		description: 'The relationships that can be populated',
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Transform(({ value }) => (Array.isArray(value) ? value : [value]))
	populate?: string[];

	@ApiPropertyOptional({
		description: 'The start date',
	})
	@IsOptional()
	@IsDate()
	@Type(() => Date)
	startDate?: Date;

	@ApiPropertyOptional({
		description: 'The end date',
	})
	@IsOptional()
	@IsDate()
	@IsGreaterThan('startDate')
	@Type(() => Date)
	endDate?: Date;

	searchQueries?: object[] = [];
}

export class GetOneRequestDto extends PickType(PaginationRequestDto, [
	'fields',
	'populate',
]) {}
