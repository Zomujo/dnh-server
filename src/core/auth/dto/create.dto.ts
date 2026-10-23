import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
	IsArray,
	IsDate,
	IsEmail,
	IsEnum,
	IsMongoId,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsPhoneNumber,
	IsString,
	Max,
	MaxDate,
	Min,
	MinLength,
	Validate,
} from 'class-validator';
import { GenderEnum } from '@/features/patients/entities/patient.entity';
import {
	AgeOrDateOfBirthConstraint,
	MINIMUM_PATIENT_AGE,
	MinimumAgeConstraint,
} from './age.validators';

export {
	AgeOrDateOfBirthConstraint,
	MINIMUM_PATIENT_AGE,
	MinimumAgeConstraint,
} from './age.validators';

export class CreateAuthDto {
	@ApiProperty({ example: 'user@email.com' })
	@IsNotEmpty()
	@IsEmail()
	email: string;

	@ApiProperty({ example: 'FiGgjHM5y767&' })
	@IsNotEmpty()
	@MinLength(6)
	password: string;
}

export class OnboardDto {
	// @ApiPropertyOptional({ example: 'GHA-123456789-0' })
	// @IsString()
	// @IsOptional()
	// ghanaCardNumber: string;

	@ApiProperty({ example: 'John' })
	@IsString()
	@IsNotEmpty()
	firstname: string;

	@ApiProperty({ example: 'Doe' })
	@IsString()
	@IsNotEmpty()
	lastname: string;

	@ApiProperty({
		description: 'Gender of the patient',
		enum: GenderEnum,
		example: 'male',
	})
	@IsEnum(['male', 'female', 'other'])
	gender: GenderEnum;

	// @ApiPropertyOptional({ example: 'NHIS-123456789' })
	// @IsString()
	// @IsOptional()
	// nhisNumber?: string;

	@ApiPropertyOptional({
		description: 'Date of birth of the patient in MM-DD-YYYY format',
		example: new Date(),
	})
	@IsOptional()
	@IsDate()
	@Type(() => Date)
	@MaxDate(() => new Date(), { message: 'dateOfBirth cannot be in the future' })
	@Validate(MinimumAgeConstraint)
	dateOfBirth?: Date;

	@ApiPropertyOptional({
		description:
			'Age of the patient in years. Provide either age or dateOfBirth.',
		example: 35,
	})
	@IsOptional()
	@IsNumber()
	@Min(MINIMUM_PATIENT_AGE, {
		message: `Patients must be at least ${MINIMUM_PATIENT_AGE} years old`,
	})
	@Max(130)
	@Validate(AgeOrDateOfBirthConstraint)
	age?: number;

	// @ApiProperty({ example: 1990 })
	// @IsNumber()
	// @IsNotEmpty()
	// yearOfBirth: number;

	@ApiProperty({ example: ['hypertension', 'diabetes'] })
	@IsArray()
	@IsString({ each: true })
	@IsNotEmpty()
	chronicConditions: string[];

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
		description: "Patient's phone number in E.164 format",
		example: '+233541234567',
	})
	@IsOptional()
	@IsPhoneNumber()
	phoneNumber?: string;
}

export class GoogleLoginDto {
	@ApiProperty({
		example:
			'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiI0Yzc5ZDc0My0xZDc1LTQ0ZDAtOTc4OC1mZTA',
	})
	@IsNotEmpty()
	idToken: string;
}

export class UserPayload {
	name: string;
	phoneNumber: string;
}
