import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class CreatePlannerDto {
	@ApiProperty({ example: 'Hello' })
	@IsNotEmpty()
	message: string;

	patientId: string;

	sessionId: string;
	personnelId: string;
}

export type StreamCompletionInput = {
	message: string;
	chatType?: string;
	sessionId: string;
	patient: {
		id: string;
		userId: string;
	};
	personnel: {
		id: string;
		userName: string;
		role: string;
	};
};
