import {
	Body,
	Controller,
	HttpStatus,
	Logger,
	Put,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomApiResponse, GetUser } from '@/common/decorators';
import { ApiSuccessResponseDto, throwError } from '@/common/utils/responses';
import { UpdateAdherenceLogQueryDto } from '../adherences/dto';
import { MedicationNotificationChoiceDto } from './dto';
import { MedicationsService } from './medications.service';

@ApiTags('Chronic Care-Doctors-Medications')
@Controller('chronic-care/doctors/medications')
export class MedicationsController {
	private logger = new Logger(MedicationsController.name);
	constructor(private readonly medicationsService: MedicationsService) {}

	@CustomApiResponse(['updated', 'authorize'], {
		message: 'Choice recieved successfully',
	})
	@Put('receive-choice')
	async receiveChoice(
		@GetUser('sub') userId: string,
		@Body() dto: MedicationNotificationChoiceDto,
		@Query() query: UpdateAdherenceLogQueryDto,
	) {
		try {
			const response = await this.medicationsService.receiveChoice(
				userId,
				dto,
				query,
			);

			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Choice recieved successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
