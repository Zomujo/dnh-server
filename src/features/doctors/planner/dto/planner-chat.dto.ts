import { ApiResponseProperty } from '@nestjs/swagger';

export class PlannerChatDto {
	@ApiResponseProperty({ example: '69befbc16d2fb27a33bc173f' })
	personnel: string;

	@ApiResponseProperty({ example: '69befbc16d2fb27a33bc173f' })
	plannerSession: string;

	@ApiResponseProperty({ example: 'user' })
	role: string;

	@ApiResponseProperty({ example: 'Hello' })
	content: string;

	@ApiResponseProperty({ example: 'text' })
	type: string;

	@ApiResponseProperty({ example: 'text' })
	from: string;
}
