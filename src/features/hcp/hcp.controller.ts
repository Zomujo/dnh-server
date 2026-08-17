import {
	Body,
	Controller,
	Delete,
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
	ApiSuccessResponseNoData,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { PersonnelRoles } from '@/core/auth/enums';
import {
	GetAppointmentRequestDto,
	GetAppointmentRequestsQueryDto,
	UpdateAppointmentRequestStatusDto,
} from '@/features/appointments/appointment-requests/dto';
import {
	CancelAppointmentDto,
	CreatePatientAppointmentDto,
	GetAppointmentDto,
	GetAppointmentsQueryDto,
	RescheduleAppointmentDto,
} from '@/features/appointments/dto';
import { ChronicCareQueryDto } from '@/features/client/dto';
import {
	GetSymptomDto,
	GetSymptomsQueryDto,
	UpdateConcernDto,
} from '@/features/concerns/dto';
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
	UpdatePatientDto,
} from '@/features/patients/dto';
import {
	BpTrendsQueryDto,
	BpTrendsResponseDto,
	CreateVitalHistoryDto,
	FilterVitalHistoriesDto,
	GetVitalHistoriesPersonnelDto,
	GetVitalHistoryDto,
	GetVitalHistoryPersonnelDto,
	UpdateVitalHistoryDto,
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
		message: 'Vitals stored successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Post('vital-histories')
	async createVitalHistory(
		@Body() dto: CreateVitalHistoryDto,
		@GetUser('sub') personnelId: string,
		@GetUser('facility') facilityId: string,
	) {
		try {
			const response = await this.hcpService.createVitalHistory(
				dto,
				personnelId,
				facilityId,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Vitals stored successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetVitalHistoriesPersonnelDto,
		message: 'Vital histories fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('vital-histories')
	async fetchVitalHistories(@Query() query: FilterVitalHistoriesDto) {
		try {
			const response = await this.hcpService.findAllVitalHistories(query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Vital histories fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound', 'authorizeChronicCare'], {
		type: GetVitalHistoryPersonnelDto,
		message: 'Vital history fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('vital-histories/:id')
	async fetchVitalHistory(@Param('id', ParseMongoIdPipe) id: string) {
		try {
			const response = await this.hcpService.findVitalHistoryById(id);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Vital history fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'notfound', 'authorizeChronicCare'], {
		message: 'Vital history updated successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Patch('vital-histories/:id')
	async updateVitalHistory(
		@Param('id', ParseMongoIdPipe) id: string,
		@Body() dto: UpdateVitalHistoryDto,
		@GetUser('sub') personnelId: string,
	) {
		try {
			const response = await this.hcpService.updateVitalHistory(
				id,
				dto,
				personnelId,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Vital history updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'notfound', 'authorizeChronicCare'], {
		message: 'Vital history deleted successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Delete('vital-histories/:id')
	async deleteVitalHistory(
		@Param('id', ParseMongoIdPipe) id: string,
		@GetUser('sub') personnelId: string,
	) {
		try {
			await this.hcpService.deleteVitalHistory(id, personnelId);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Vital history deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['created', 'authorizeChronicCare'], {
		message: 'Appointment created successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Post('patients/:patientId/appointments')
	async createPatientAppointment(
		@Param('patientId') patientId: string,
		@GetUser('sub', ParseMongoIdPipe) personnelId: string,
		@GetUser('facility') facilityId: string,
		@Body() dto: CreatePatientAppointmentDto,
	) {
		try {
			const response = await this.hcpService.createPatientAppointment(
				patientId,
				personnelId,
				facilityId,
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

	@CustomApiResponse(['created', 'authorizeChronicCare'], {
		message: 'Patient created successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Post('patients')
	async createPatient(
		@Body() dto: UpdatePatientDto,
		@GetUser('sub') personnelId: string,
		@GetUser('facility') facilityId: string,
	) {
		try {
			const response = await this.hcpService.createPatient(
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

	@CustomApiResponse(['updated', 'notfound', 'authorizeChronicCare'], {
		message: 'Patient updated successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Patch('patients/:id')
	async updatePatient(
		@Param('id', ParseMongoIdPipe) id: string,
		@Body() dto: UpdatePatientDto,
	) {
		try {
			const response = await this.hcpService.updatePatient(id, dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Patient updated successfully',
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

	@CustomApiResponse(['updated', 'authorizeChronicCare'], {
		message: 'Vital history log updated successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Patch('patients/:patientId/vital-histories/logs/:id')
	async updateVitalHistoryLog(
		@Param('patientId') patientId: string,
		@Param('id') id: string,
		@Body() dto: UpdateVitalLogDto,
		@GetUser('sub') personnelId: string,
	) {
		try {
			const response = await this.hcpService.updateVitalHistoryLog(
				patientId,
				id,
				dto,
				personnelId,
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

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetAppointmentRequestDto,
		message: 'Appointment requests fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:patientId/appointment-requests')
	async findPatientAppointmentRequests(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@GetUser('facility') facilityId: string,
		@Query() query: GetAppointmentRequestsQueryDto,
	) {
		try {
			const response = await this.hcpService.findPatientAppointmentRequests(
				patientId,
				facilityId,
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
				'Appointment requests fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound', 'authorizeChronicCare'], {
		type: GetAppointmentRequestDto,
		message: 'Appointment request fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:patientId/appointment-requests/:id')
	async findPatientAppointmentRequest(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
	) {
		try {
			const response = await this.hcpService.findPatientAppointmentRequest(
				patientId,
				id,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Appointment request fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'notfound', 'authorizeChronicCare'], {
		message: 'Appointment request status updated successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Patch('patients/:patientId/appointment-requests/:id')
	async updatePatientAppointmentRequestStatus(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
		@GetUser('sub') personnelId: string,
		@GetUser('facility') facilityId: string,
		@Body() dto: UpdateAppointmentRequestStatusDto,
	) {
		try {
			const response =
				await this.hcpService.updatePatientAppointmentRequestStatus(
					patientId,
					id,
					dto,
					personnelId,
					facilityId,
				);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Appointment request status updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'notfound', 'authorizeChronicCare'], {
		message: 'Appointment request deleted successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Delete('patients/:patientId/appointment-requests/:id')
	async deletePatientAppointmentRequest(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
	) {
		try {
			await this.hcpService.deletePatientAppointmentRequest(patientId, id);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Appointment request deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetSymptomDto,
		message: 'Symptoms fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:patientId/symptoms')
	async findPatientSymptoms(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@GetUser('facility') facilityId: string,
		@Query() query: GetSymptomsQueryDto,
	) {
		try {
			const response = await this.hcpService.findPatientSymptoms(
				patientId,
				facilityId,
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
				'Symptoms fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound', 'authorizeChronicCare'], {
		type: GetSymptomDto,
		message: 'Symptom fetched successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Get('patients/:patientId/symptoms/:id')
	async findPatientSymptom(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
		@GetUser('facility') facilityId: string,
	) {
		try {
			const response = await this.hcpService.findPatientSymptom(
				patientId,
				facilityId,
				id,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Symptom fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'notfound', 'authorizeChronicCare'], {
		message: 'Symptom updated successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Patch('patients/:patientId/symptoms/:id')
	async updatePatientSymptom(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
		@GetUser('facility') facilityId: string,
		@Body() dto: UpdateConcernDto,
	) {
		try {
			const response = await this.hcpService.updatePatientSymptom(
				patientId,
				facilityId,
				id,
				dto,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Symptom updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'notfound', 'authorizeChronicCare'], {
		message: 'Symptom deleted successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Delete('patients/:patientId/symptoms/:id')
	async deletePatientSymptom(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
		@GetUser('facility') facilityId: string,
	) {
		try {
			await this.hcpService.deletePatientSymptom(patientId, facilityId, id);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Symptom deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'notfound', 'authorizeChronicCare'], {
		message: 'Symptom resolved successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Patch('patients/:patientId/symptoms/:id/resolve')
	async resolvePatientSymptom(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
		@GetUser('facility') facilityId: string,
	) {
		try {
			const response = await this.hcpService.resolvePatientSymptom(
				patientId,
				facilityId,
				id,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Symptom resolved successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'authorizeChronicCare'], {
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

	@CustomApiResponse(['updated', 'authorizeChronicCare'], {
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

	@CustomApiResponse(['updated', 'authorizeChronicCare'], {
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
