import { ApiResponseProperty } from '@nestjs/swagger';

export class PlannerSessionDto {
	@ApiResponseProperty({ example: '69befbc16d2fb27a33bc173f' })
	patientId: string;

	@ApiResponseProperty({ example: 'Session 1' })
	name: string;
}
