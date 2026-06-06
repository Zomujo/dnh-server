import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { Patient } from '../entities/patient.entity';

export class SummaryDto {
	@ApiProperty()
	@IsString()
	userId: string;

	@ApiProperty({ description: 'Patient ID' })
	@IsString()
	patient: string | Patient;

	@ApiProperty({ type: 'object', additionalProperties: { type: 'object' } })
	@IsOptional()
	@IsObject()
	chronicConditions?: Record<string, { status: string; notes: string }>;

	@ApiProperty({ type: 'object', additionalProperties: { type: 'object' } })
	@IsOptional()
	@IsObject()
	medications?: Record<string, { frequency: any; totalExpectedCount: number }>;

	@ApiProperty()
	@IsOptional()
	@IsObject()
	concerns?: any;

	@ApiProperty()
	@IsOptional()
	@IsObject()
	vitalHistories?: Record<string, any>;

	@ApiProperty()
	@IsOptional()
	@IsObject()
	adherences?: any;

	@ApiProperty()
	@IsOptional()
	@IsObject()
	aiInsights?: any;
}
