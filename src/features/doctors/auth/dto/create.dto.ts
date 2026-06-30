import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsMongoId, IsOptional, IsString } from 'class-validator';

export enum PersonnelRoles {
	CLINICIAN = 'clinician',
	PHARMACY = 'pharmacy',
}

export enum PersonnelProviders {
	GOOGLE = 'google',
}

export class CreatePersonnelDto {
	email?: string;
	provider?: PersonnelProviders;

	providerUserId?: string;

	@ApiPropertyOptional({
		example: 'John',
		description: 'Personnel first name',
	})
	@IsOptional()
	@IsString()
	@Transform(({ value }) => value?.trim())
	firstname?: string;

	@ApiPropertyOptional({
		example: 'Doe',
		description: 'Personnel last name',
	})
	@IsOptional()
	@IsString()
	@Transform(({ value }) => value?.trim())
	lastname?: string;

	@ApiPropertyOptional({
		example: '+233501234567',
		description: 'Personnel phone number',
	})
	@IsOptional()
	@IsString()
	phoneNumber?: string;

	@ApiPropertyOptional({
		example: 'PID-001234',
		description: 'Personnel ID number',
	})
	@IsOptional()
	@IsString()
	personnelIdNumber?: string;

	@ApiPropertyOptional({
		description: 'Facility ID (MongoDB ObjectId) this personnel belongs to',
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
		name: 'facilityId',
	})
	@Expose({ name: 'facilityId' })
	@IsOptional()
	@IsString()
	@IsMongoId()
	facility?: string;
}
