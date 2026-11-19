import {
	ApiProperty,
	ApiPropertyOptional,
	ApiResponseProperty,
} from '@nestjs/swagger';
import {
	IsBoolean,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';
import { ConsentChannel, ConsentStatus } from '../entities/consent.entity';

/**
 * Consent captured alongside a registration (app onboarding, or a
 * clinician/pharmacy registering a patient). Optional on those requests so
 * older app builds keep working; when present it is recorded as granted.
 */
export class ConsentInputDto {
	@ApiProperty({
		description:
			'Version of the privacy notice / consent text the patient agreed to',
		example: '2026-11',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(32)
	policyVersion: string;
}

/**
 * Consent captured by a clinician or pharmacy user on a patient's record.
 * A withdrawal the patient made themselves is kept unless the staff member
 * explicitly overrides it (the patient has since agreed again in person).
 */
export class StaffConsentInputDto extends ConsentInputDto {
	@ApiPropertyOptional({
		description:
			'Set true only when the patient withdrew consent earlier and has now ' +
			'agreed again in front of you. Without it, a withdrawal is kept and ' +
			'the request is rejected with 409.',
		example: false,
	})
	@IsOptional()
	@IsBoolean()
	overrideWithdrawal?: boolean;
}

/** PUT /client/consent: the patient grants or withdraws consent. */
export class UpdateConsentDto extends ConsentInputDto {
	@ApiProperty({
		description: 'true to grant consent, false to withdraw it',
		example: true,
	})
	@IsBoolean()
	granted: boolean;
}

export class ConsentDto {
	@ApiResponseProperty({ enum: ConsentStatus, example: ConsentStatus.GRANTED })
	status: ConsentStatus;

	@ApiResponseProperty({ example: '2026-11' })
	policyVersion: string;

	@ApiResponseProperty({ enum: ConsentChannel, example: ConsentChannel.APP })
	channel: ConsentChannel;

	@ApiResponseProperty({ example: '2026-11-19T10:00:00.000Z' })
	recordedAt: Date;

	@ApiPropertyOptional({
		description: 'Personnel who captured it (channel hcp only)',
		example: '664b7f8e2c2a1e4b8f1d2c3a',
	})
	recordedBy?: string;
}

export class ConsentStateDto {
	@ApiPropertyOptional({
		type: ConsentDto,
		description: 'Current decision; null when none was ever recorded',
		nullable: true,
	})
	consent: ConsentDto | null;

	@ApiResponseProperty({ type: [ConsentDto] })
	history: ConsentDto[];
}
