import { ApiProperty, ApiResponseProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, Matches } from 'class-validator';

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
	// ISO 8601 also allows 20261022, 2026-W43 and 2026-296, which new Date()
	// can't parse; an Invalid Date would slip past every date check. Require
	// the calendar form, and strict rejects impossible days like 2026-02-30.
	@IsISO8601({ strict: true, strictSeparator: true })
	@Matches(/^\d{4}-\d{2}-\d{2}(T|$)/, {
		message: 'scheduledFor must be a YYYY-MM-DD date or datetime',
	})
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
