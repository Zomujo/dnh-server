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
	Min,
	MinLength,
	Validate,
	ValidationArguments,
	ValidatorConstraint,
	ValidatorConstraintInterface,
} from 'class-validator';
import { GenderEnum } from '@/features/patients/entities/patient.entity';

@ValidatorConstraint({ name: 'ageOrDateOfBirth', async: false })
export class AgeOrDateOfBirthConstraint
	implements ValidatorConstraintInterface
{
	validate(_value: any, args: ValidationArguments) {
		const dto = args.object as any;
		return !!(dto.age || dto.dateOfBirth);
	}

	defaultMessage() {
		return 'Either age or dateOfBirth must be provided';
	}
}

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
	dateOfBirth?: Date;

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
