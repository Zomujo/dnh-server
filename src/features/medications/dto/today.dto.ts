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
	morning: number;

	@ApiResponseProperty({ example: 2 })
	afternoon: number;

	@ApiResponseProperty({ example: 1 })
	evening: number;
}

export class TodaysMedicationDto {
	@ApiResponseProperty({ example: '68e3ca3c2383b37fe4cb88a8' })
	id: string;

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
