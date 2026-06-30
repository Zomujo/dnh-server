import { ApiResponseProperty } from '@nestjs/swagger';
import { PersonnelDto } from '../../dto';

export class GetPersonnelDto extends PersonnelDto {
	@ApiResponseProperty({
		example: 0,
	})
	assignedPatientsCount: number;
}
