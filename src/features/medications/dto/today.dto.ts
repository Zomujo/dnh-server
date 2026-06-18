import { ApiProperty, ApiResponseProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum MedicationSection {
	MORNING = 'MORNING',
	AFTERNOON = 'AFTERNOON',
	EVENING = 'EVENING',
}

export class TodaysMedicationsQueryDto {
	@ApiProperty({
		description: 'Time section of the day',
		enum: MedicationSection,
		example: MedicationSection.MORNING,
	})
	@IsEnum(MedicationSection)
	section: MedicationSection;
}

export class TodaysMedicationCountDto {
	@ApiResponseProperty({ example: 3 })
	MORNING: number;

	@ApiResponseProperty({ example: 2 })
	AFTERNOON: number;

	@ApiResponseProperty({ example: 1 })
	EVENING: number;
}

export class TodaysMedicationDto {
	@ApiResponseProperty({ example: 'Metformin' })
	name: string;

	@ApiResponseProperty({ example: '500mg' })
	dosage: string;

	@ApiResponseProperty({ example: 'Blood pressure control' })
	purpose: string;

	@ApiResponseProperty({ example: new Date() })
	toBeTakenAt: Date;

	@ApiResponseProperty({ example: false })
	taken: boolean;
}
