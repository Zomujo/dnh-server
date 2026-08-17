import {
	Body,
	Controller,
	Get,
	HttpStatus,
	Logger,
	Param,
	Post,
	Query,
	Sse,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { catchError, map, Observable, of } from 'rxjs';
import {
	Authorize,
	CustomApiResponse,
	GetUser,
	Roles,
} from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import {
	ApiSuccessResponseDto,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { PersonnelRoles, UserType } from '@/core/auth/enums';
import { GetVitalHistoryDto } from '@/features/vital-histories/dto';
import {
	CreatePharmacyPatientDto,
	FilterPatientsDto,
	FilterPatientsNoPaginateDto,
	GetPatientDto,
	GetPatientNoPaginateDto,
	GetPersonnelPatientDto,
} from './dto';
import { PatientsService } from './patients.service';

@ApiTags('Dnh Personnel-Pharmacy')
@Controller('personnel/pharmacies/patients')
export class PatientsController {
	private logger = new Logger(PatientsController.name);
	constructor(private readonly patientsService: PatientsService) {}

	// @CustomApiResponse(['paginated'], {
	// 	type: GetPersonnelPatientsDto,
	// 	message: 'Patients fetched successfully',
	// })
	// @Get()
	// async findAll(@Query() query: FilterPatientsDto) {
	// 	try {
	// 		const response = await this.patientsService.findAll(query);
	// 		const paginated = new PaginatedDataResponseDto(
	// 			response.rows,
	// 			query.page,
	// 			query.pageSize,
	// 			response.count,
	// 		);
	// 		return new ApiSuccessResponseDto(
	// 			paginated,
	// 			HttpStatus.OK,
	// 			'Patients fetched successfully',
	// 		);
	// 	} catch (error) {
	// 		throwError(this.logger, error);
	// 	}
	// }

	@CustomApiResponse(['created', 'authorizeChronicCare'], {
		message: 'Patient created successfully',
	})
	@Roles(PersonnelRoles.PHARMACY)
	@Post()
	async createPatient(
		@Body() dto: CreatePharmacyPatientDto,
		@GetUser('sub') personnelId: string,
		@GetUser('facility') facilityId: string,
	) {
		try {
			const response = await this.patientsService.createByPersonnel(
				dto,
				personnelId,
				facilityId,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Patient created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetPatientDto,
		message: 'Patients fetched successfully',
	})
	@Roles(PersonnelRoles.PHARMACY)
	@Get()
	async findAllForPharmacy(@Query() query: FilterPatientsDto) {
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

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		type: GetPatientNoPaginateDto,
		isArray: true,
		message: 'Patients fetched successfully',
	})
	@Roles(PersonnelRoles.PHARMACY)
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

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		type: GetVitalHistoryDto,
		isArray: true,
		message: 'Vital histories fetched successfully',
	})
	@Roles(PersonnelRoles.PHARMACY)
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

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		type: GetPersonnelPatientDto,
		message: 'Patient fetched successfully',
	})
	@Roles(PersonnelRoles.PHARMACY)
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

	@Authorize(UserType.CHRONIC_CARE)
	@Roles(PersonnelRoles.PHARMACY)
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
