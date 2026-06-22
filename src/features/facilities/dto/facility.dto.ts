import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsPhoneNumber, IsString } from 'class-validator';
import { GenericResponseDto } from '@/common/dto';

export class FacilityDto extends GenericResponseDto {
	@ApiProperty({
		description: 'Name of the medical facility',
		example: 'Korle Bu Teaching Hospital',
	})
	@IsString()
	name: string;

	@ApiPropertyOptional({
		description: 'Phone number of the facility',
		example: '+233302123456',
	})
	@IsOptional()
	@IsPhoneNumber('GH')
	phoneNumber?: string;
}
