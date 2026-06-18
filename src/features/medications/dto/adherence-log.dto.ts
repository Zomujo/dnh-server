import { ApiProperty, ApiResponseProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class MedicationAdherenceDayDto {
	@ApiResponseProperty({ example: new Date() })
	takenAt: Date;

	@ApiResponseProperty({ example: true })
	taken: boolean | null;

	@ApiResponseProperty({ example: '68e3ca3c2383b37fe4cb88a8' })
	id: string;
}

export class MedicationAdherenceLogsDto {
	@ApiResponseProperty({ example: 'Metformin' })
	medicationName: string;

	@ApiResponseProperty({ example: 73 })
	adherenceRate: number;

	@ApiResponseProperty({ type: [MedicationAdherenceDayDto] })
	logs: MedicationAdherenceDayDto[];
}

export class AdherenceLogsQueryDto {
	@ApiProperty({
		description: 'Any date in the target month (e.g. 2026-06-15 for June 2026)',
		example: '2026-06-15',
	})
	@IsDateString()
	date: string;
}
