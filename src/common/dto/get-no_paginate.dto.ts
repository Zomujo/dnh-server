import { ApiResponseProperty } from '@nestjs/swagger';

export class GetNoPaginateDto {
	@ApiResponseProperty({
		example: '8c4753ae-21ad-4153-8f32-1aacc4da2643',
	})
	id: string;

	@ApiResponseProperty({
		example: 'Some Name',
	})
	name: string;
}
