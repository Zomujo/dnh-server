import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, MaxDate } from 'class-validator';
import { ConcernDto } from './concern.dto';

export const ConcernNameTypeMap: Record<string, string> = {
	symptoms: 'Symptoms',
	sideEffect: 'Side Effect',
	mentalHealth: 'Mental Health',
	general: 'General',
	other: 'Other',
};

export class CreateConcernDto {}

/** Allowance for a phone clock running slightly ahead of the server. */
const ONSET_CLOCK_SKEW_MS = 5 * 60 * 1000;

export class AddSymptomsDto extends PickType(ConcernDto, ['description']) {
	@ApiPropertyOptional({
		description:
			'When the symptom started (ISO 8601). Defaults to now; must not be in the future. ' +
			'Send it for symptoms recorded offline so they keep their real time.',
		example: '2026-10-22T08:30:00Z',
		type: String,
		format: 'date-time',
	})
	@IsOptional()
	@Type(() => Date)
	@IsDate()
	@MaxDate(() => new Date(Date.now() + ONSET_CLOCK_SKEW_MS), {
		message: 'onsetDate must not be in the future',
	})
	onsetDate?: Date;
}
