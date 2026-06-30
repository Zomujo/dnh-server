import {
	Body,
	Controller,
	Get,
	HttpStatus,
	Logger,
	Param,
	Patch,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomApiResponse, GetUser, Roles } from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import {
	ApiSuccessResponseDto,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { PersonnelRoles } from '@/core/auth/enums';
import {
	AppointmentDto,
	CancelAppointmentDto,
	CreatePatientAppointmentDto,
	GetAppointmentDto,
	GetAppointmentsQueryDto,
	RescheduleAppointmentDto,
} from '@/features/appointments/dto';
import { ChronicCareQueryDto } from '@/features/client/dto';
import {
	AdherenceLogsQueryDto,
	GetMedicationDto,
	MedicationAdherenceLogsDto,
} from '@/features/medications/dto';
import {
	FilterPatientsDto,
	FilterPatientsNoPaginateDto,
	GetPatientNoPaginateDto,
	GetPersonnelPatientDto,
	GetPersonnelPatientsDto,
} from '@/features/patients/dto';
import {
	BpTrendsQueryDto,
	BpTrendsResponseDto,
	GetVitalHistoryDto,
	UpdateVitalLogDto,
	VitalHistoryTrendsQueryDto,
	VitalHistoryTrendsResponseDto,
} from '@/features/vital-histories/dto';
import { HcpService } from './hcp.service';

@ApiTags('Dnh Personnel-HCP')
@Controller('hcp')
export class HcpController {
	private logger = new Logger(HcpController.name);

	constructor(private readonly hcpService: HcpService) {}

	@CustomApiResponse(['created', 'authorizeChronicCare'], {
		message: 'Appointment created successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Post('patients/:patientId/appointments')
	async createPatientAppointment(
		@Param('patientId') patientId: string,
		@GetUser('sub', ParseMongoIdPipe) personnelId: string,
		@Body() dto: CreatePatientAppointmentDto,
	) {
		try {
			const response = await this.hcpService.createPatientAppointment(
				patientId,
				personnelId,
				dto,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Appointment created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetPersonnelPatientsDto,
		message: 'Patients fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients')
	async findAllPatients(@Query() query: FilterPatientsDto) {
		try {
			const response = await this.hcpService.findAllPatients(query);
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
		type: GetVitalHistoryDto,
		isArray: true,
		message: 'Vital histories fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:patientId/vitals/latest')
	async fetchLatestPatientVitals(@Param('patientId') patientId: string) {
		try {
			const response =
				await this.hcpService.fetchLatestPatientVitals(patientId);
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
		type: GetPatientNoPaginateDto,
		isArray: true,
		message: 'Patients fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/no-paginate')
	async findAllPatientsNoPaginate(@Query() query: FilterPatientsNoPaginateDto) {
		try {
			const response = await this.hcpService.findAllPatientsNoPaginate(query);
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
		type: GetPersonnelPatientDto,
		message: 'Patient fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:id')
	async findOnePatient(@Param('id') id: string) {
		try {
			const response = await this.hcpService.findOnePatient(id);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Patient fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetMedicationDto,
		message: 'Medications fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:patientId/medications')
	async findPatientMedications(
		@Param('patientId') patientId: string,
		@Query() query: ChronicCareQueryDto,
	) {
		try {
			const response = await this.hcpService.findPatientMedications(
				patientId,
				query,
			);
			const paginated = new PaginatedDataResponseDto(
				response.medications,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Medications fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		type: MedicationAdherenceLogsDto,
		message: 'Medication adherence logs fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:patientId/medications/:medicationId/adherence')
	async findPatientMedicationAdherenceLogs(
		@Param('patientId') patientId: string,
		@Param('medicationId') medicationId: string,
		@Query() query: AdherenceLogsQueryDto,
	) {
		try {
			const response = await this.hcpService.findPatientMedicationAdherenceLogs(
				patientId,
				medicationId,
				query,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Medication adherence logs fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound', 'authorizeChronicCare'], {
		type: VitalHistoryTrendsResponseDto,
		message: 'Vital history trends fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:patientId/vital-histories/trends')
	async findPatientVitalTrends(
		@Param('patientId') patientId: string,
		@Query() query: VitalHistoryTrendsQueryDto,
	) {
		try {
			const response = await this.hcpService.findPatientVitalTrends(
				patientId,
				query,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Vital history trends fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound', 'authorizeChronicCare'], {
		type: BpTrendsResponseDto,
		message: 'BP trends fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:patientId/vital-histories/trends/bp')
	async findPatientBpTrends(
		@Param('patientId') patientId: string,
		@Query() query: BpTrendsQueryDto,
	) {
		try {
			const response = await this.hcpService.findPatientBpTrends(
				patientId,
				query,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'BP trends fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetVitalHistoryDto,
		message: 'Vital history logs fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:patientId/vital-histories/logs')
	async findPatientVitalHistoryLogs(
		@Param('patientId') patientId: string,
		@Query() query: ChronicCareQueryDto,
	) {
		try {
			const response = await this.hcpService.findPatientVitalHistoryLogs(
				patientId,
				query,
			);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page || 1,
				query.pageSize || 10,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Vital history logs fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		type: GetVitalHistoryDto,
		message: 'Vital history log fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:patientId/vital-histories/logs/:id')
	async findVitalHistoryLogById(
		@Param('patientId') patientId: string,
		@Param('id') id: string,
	) {
		try {
			const response = await this.hcpService.findVitalHistoryLogById(
				patientId,
				id,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Vital history log fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		message: 'Vital history log updated successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Patch('patients/:patientId/vital-histories/logs/:id')
	async updateVitalHistoryLog(
		@Param('patientId') patientId: string,
		@Param('id') id: string,
		@Body() dto: UpdateVitalLogDto,
	) {
		try {
			const response = await this.hcpService.updateVitalHistoryLog(
				patientId,
				id,
				dto,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Vital history log updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetAppointmentDto,
		message: 'Appointments fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:patientId/appointments')
	async findPatientAppointments(
		@Param('patientId') patientId: string,
		@Query() query: GetAppointmentsQueryDto,
	) {
		try {
			const response = await this.hcpService.findPatientAppointments(
				patientId,
				query,
			);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Appointments fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		type: AppointmentDto,
		message: 'Appointment cancelled successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Patch('patients/:patientId/appointments/:id/cancel')
	async cancelPatientAppointment(
		@Param('patientId') patientId: string,
		@Param('id') id: string,
		@GetUser('sub', ParseMongoIdPipe) personnelId: string,
		@Body() dto: CancelAppointmentDto,
	) {
		try {
			const response = await this.hcpService.cancelPatientAppointment(
				patientId,
				id,
				personnelId,
				dto,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Appointment cancelled successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		type: AppointmentDto,
		message: 'Appointment rescheduled successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Patch('patients/:patientId/appointments/:id/reschedule')
	async reschedulePatientAppointment(
		@Param('patientId') patientId: string,
		@Param('id') id: string,
		@GetUser('sub', ParseMongoIdPipe) personnelId: string,
		@Body() dto: RescheduleAppointmentDto,
	) {
		try {
			const response = await this.hcpService.reschedulePatientAppointment(
				patientId,
				id,
				personnelId,
				dto,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Appointment rescheduled successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		type: AppointmentDto,
		message: 'Appointment completed successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Put('patients/:patientId/appointments/:id/complete')
	async completePatientAppointment(
		@Param('patientId') patientId: string,
		@Param('id') id: string,
		@GetUser('sub', ParseMongoIdPipe) personnelId: string,
	) {
		try {
			const response = await this.hcpService.completePatientAppointment(
				patientId,
				id,
				personnelId,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Appointment completed successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
