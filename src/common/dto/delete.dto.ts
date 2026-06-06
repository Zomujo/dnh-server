import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsMongoId, IsNotEmpty } from 'class-validator';

export class DeleteItemsDto {
	@ApiProperty({
		example: ['6797f22a6df790f6bde152f2', '6797f2312bb30db818b7b98b'],
		description: 'Ids of suppliers to be deleted',
	})
	@IsNotEmpty()
	@IsArray()
	@IsMongoId({ each: true })
	ids: string[];
}
