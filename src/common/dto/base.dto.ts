import { ApiResponseProperty } from '@nestjs/swagger';

export class GenericResponseDto {
	constructor(entity?: { id: string; createdAt: Date; updatedAt: Date }) {
		if (!entity) return;

		this.id = entity.id;
		this.createdAt = entity.createdAt;
		this.updatedAt = entity.updatedAt;
	}

	@ApiResponseProperty({
		example: '019ad9aa-1827-7d7a-90a9-6f63259096ed',
	})
	id: string;

	@ApiResponseProperty({ example: new Date() })
	createdAt: Date;

	@ApiResponseProperty({ example: new Date() })
	updatedAt: Date;
}

// @ApiResponseProperty({
//   example: null,
// })
// deletedAt: Date;

// @ApiResponseProperty({
//   example: null,
// })
// deletedBy: string;
