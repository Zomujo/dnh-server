import {
	Controller,
	Get,
	HttpStatus,
	Logger,
	Param,
	Query,
	Sse,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { catchError, map, Observable, of } from 'rxjs';
import { CustomApiResponse, GetUser } from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import {
	ApiSuccessResponseDto,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { GetVitalHistoryDto } from '@/features/vital-histories/dto';
import {
	FilterPatientsDto,
	FilterPatientsNoPaginateDto,
	GetPatientDto,
	GetPatientNoPaginateDto,
	GetPersonnelPatientDto,
	GetPersonnelPatientsDto,
} from './dto';
import { PatientsService } from './patients.service';

@ApiTags('Dnh Personnel-Patients')
@Controller('personnel/patients')
export class PatientsController {
	private logger = new Logger(PatientsController.name);
	constructor(private readonly patientsService: PatientsService) {}

	@CustomApiResponse(['paginated'], {
		type: GetPersonnelPatientsDto,
		message: 'Patients fetched successfully',
	})
	@Get()
	async findAll(@Query() query: FilterPatientsDto) {
		try {
			const response = await this.patientsService.findAll(query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Patients fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetPatientDto,
		message: 'Patients fetched successfully',
	})
	@Get('pharmacies')
	async findAllForPharmacy(
		@Query() query: FilterPatientsDto,
		@GetUser('sub') personnelId: string,
	) {
		try {
			query.personnelId = personnelId;
			const response = await this.patientsService.findAll(query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Patients fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success'], {
		type: GetPatientNoPaginateDto,
		isArray: true,
		message: 'Patients fetched successfully',
	})
	@Get('no-paginate')
	async findAllNoPaginate(@Query() query: FilterPatientsNoPaginateDto) {
		try {
			const response = await this.patientsService.findAllNoPaginate(query);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Patients fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success'], {
		type: GetVitalHistoryDto,
		isArray: true,
		message: 'Vital histories fetched successfully',
	})
	@Get(':patientId/vitals/latest')
	async fetchLatestPatientVitals(@Param('patientId') patientId: string) {
		try {
			const response =
				await this.patientsService.fetchLatestPatientVitals(patientId);
			return new ApiSuccessResponseDto(
				response.rows,
				HttpStatus.OK,
				'Vital histories fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success'], {
		type: GetPersonnelPatientDto,
		message: 'Patient fetched successfully',
	})
	@Get(':id')
	async findOne(@Param('id') id: string) {
		try {
			const response = await this.patientsService.findOne(id);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Patient fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@Sse('summary/:patientId')
	async handleSummary(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
	): Promise<Observable<MessageEvent>> {
		try {
			const response = await this.patientsService.generateSummary(patientId);
			return response.pipe(
				map((data) => data),
				catchError((err) => {
					this.logger.error(
						`An error occurred during summary streaming: ${err.name} :: ${err.message}`,
						err.stack,
					);
					return of(
						new MessageEvent('error', {
							data: { status: 'error', message: 'Stream interrupted' },
						}),
					);
				}),
			);
		} catch (error) {
			const stack = error instanceof Error ? error.stack : String(error);
			const name = error instanceof Error ? error.name : String(error);
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Setup Error: ${name} :: ${message}`, stack);
			return of(
				new MessageEvent('error', {
					data: { status: 'error', message: 'Failed to initialize summary' },
				}),
			);
		}
	}
}
