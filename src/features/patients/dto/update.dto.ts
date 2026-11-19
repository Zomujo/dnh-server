import {
	ApiPropertyOptional,
	OmitType,
	PartialType,
	PickType,
} from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
	IsMongoId,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Min,
	Validate,
	ValidateNested,
} from 'class-validator';
import { AgeOrDateOfBirthConstraint } from '@/core/auth/dto/age.validators';
import { ConsentInputDto } from './consent.dto';
import { PatientDto } from './patient.dto';

export class UpdatePatientDto extends PartialType(
	PickType(PatientDto, [
		'dateOfBirth',
		'ghanaCardNumber',
		'nhisNumber',
		'phoneNumber',
		'gender',
		'chronicConditions',
	]),
) {
	@ApiPropertyOptional({ example: 'John' })
	@IsString()
	@IsNotEmpty()
	@IsOptional()
	firstname?: string;

	@ApiPropertyOptional({ example: 'Doe' })
	@IsString()
	@IsNotEmpty()
	@IsOptional()
	lastname?: string;

	@ApiPropertyOptional({
		description:
			'Age of the patient in years. Provide either age or dateOfBirth.',
		example: 35,
	})
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Validate(AgeOrDateOfBirthConstraint)
	age?: number;

	@ApiPropertyOptional({
		description:
			'Facility ID (MongoDB ObjectId) to associate with this patient',
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
		name: 'facilityId',
	})
	@IsOptional()
	@IsString()
	@IsMongoId()
	@Expose({ name: 'facilityId' })
	facility?: string;

	@ApiPropertyOptional({
		type: ConsentInputDto,
		description:
			'Send when the patient has agreed to the privacy notice in front of ' +
			'you. Recorded as consent granted, captured by the calling personnel.',
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => ConsentInputDto)
	consent?: ConsentInputDto;
}

export class CreatePharmacyPatientDto extends OmitType(UpdatePatientDto, [
	'facility',
]) {}
