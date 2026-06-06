import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsMongoId, IsNotEmpty } from 'class-validator';
import { CreateAdherenceDto } from './create.dto';

export class UpdateAdherenceDto extends PartialType(CreateAdherenceDto) {}

export class UpdateAdherenceLogQueryDto {
	@ApiProperty({ example: ['60d21b4667d0d8992e610c85'] })
	@IsNotEmpty()
	@IsArray()
	@IsMongoId({ each: true })
	@Transform(({ value }) => (Array.isArray(value) ? value : [value]))
	id: string[];
}
