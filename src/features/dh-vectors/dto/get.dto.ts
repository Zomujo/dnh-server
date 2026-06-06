import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsNotEmpty } from 'class-validator';
import { DHDocumentType } from './create.dto';

export class GetDhVectorDto {
	@ApiProperty()
	@IsNotEmpty()
	userId: string;

	@ApiProperty()
	@IsNotEmpty()
	@IsMongoId()
	patient: string;

	@ApiProperty({ enum: DHDocumentType })
	@IsNotEmpty()
	@IsEnum(DHDocumentType)
	documentType: DHDocumentType;
}

export class QueryDhVectorsDto extends GetDhVectorDto {
	@ApiProperty()
	@IsNotEmpty()
	query: string;
}
