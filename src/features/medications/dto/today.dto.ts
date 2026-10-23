import { ApiProperty, ApiResponseProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

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

/** How far back a dose can be confirmed (e.g. one taken while offline). */
export const MAX_DOSE_CONFIRM_BACKDATE_HOURS = 48;

export class ConfirmMedicationQueryDto extends TodaysMedicationsQueryDto {
	@ApiProperty({
		description:
			'Day of the dose being confirmed (ISO date or datetime). Defaults to today. ' +
			`The dose time on that day must be at most ${MAX_DOSE_CONFIRM_BACKDATE_HOURS} h ago.`,
		required: false,
		example: '2026-10-22',
	})
	@IsOptional()
	@IsISO8601()
	scheduledFor?: string;
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
