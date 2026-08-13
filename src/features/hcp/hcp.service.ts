import { Injectable, NotFoundException } from '@nestjs/common';
import {
	eachDayOfInterval,
	endOfMonth,
	getDate,
	isFuture,
	isToday,
	startOfMonth,
} from 'date-fns';
import { Types } from 'mongoose';
import { generateFilter } from '@/common/factory';
import { AdherencesService } from '@/features/adherences/adherences.service';
import { TargetType } from '@/features/adherences/dto';
import { AppointmentRequestsService } from '@/features/appointments/appointment-requests/appointment-requests.service';
import {
	AppointmentRequestStatus,
	GetAppointmentRequestsQueryDto,
	UpdateAppointmentRequestStatusDto,
} from '@/features/appointments/appointment-requests/dto';
import { AppointmentsService } from '@/features/appointments/appointments.service';
import {
	CancelAppointmentDto,
	CreatePatientAppointmentDto,
	GetAppointmentsQueryDto,
	RescheduleAppointmentDto,
} from '@/features/appointments/dto';
import { ChronicCareQueryDto } from '@/features/client/dto';
import { ConcernsService } from '@/features/concerns/concerns.service';
import { GetSymptomsQueryDto, UpdateConcernDto } from '@/features/concerns/dto';
import {
	AdherenceLogsQueryDto,
	MedicationAdherenceLogsDto,
} from '@/features/medications/dto';
import { MedicationsService } from '@/features/medications/medications.service';
import { PushService } from '@/features/notifications/push/push.service';
import {
	FilterPatientsDto,
	FilterPatientsNoPaginateDto,
	UpdatePatientDto,
} from '@/features/patients/dto';
import { PatientsService } from '@/features/patients/patients.service';
import {
	BpTrendsQueryDto,
	CreateVitalHistoryDto,
	FilterVitalHistoriesDto,
	UpdateVitalHistoryDto,
	UpdateVitalLogDto,
	VitalHistoryTrendsQueryDto,
} from '@/features/vital-histories/dto';
import { VitalSeverityEnum } from '@/features/vital-histories/entities/vital-history.entity';
import { VitalHistoriesService } from '@/features/vital-histories/vital-histories.service';

@Injectable()
export class HcpService {
	constructor(
		private readonly patientsService: PatientsService,
		private readonly medicationsService: MedicationsService,
		private readonly adherencesService: AdherencesService,
		private readonly vitalHistoriesService: VitalHistoriesService,
		private readonly appointmentsService: AppointmentsService,
		private readonly appointmentRequestsService: AppointmentRequestsService,
		private readonly concernsService: ConcernsService,
		private readonly pushService: PushService,
	) {}

	async createVitalHistory(dto: CreateVitalHistoryDto, personnelId: string) {
		return this.vitalHistoriesService.create(dto, personnelId);
	}

	async findAllVitalHistories(query: FilterVitalHistoriesDto) {
		return this.vitalHistoriesService.findAll(query);
	}

	async findVitalHistoryById(id: string) {
		return this.vitalHistoriesService.findOne(id);
	}

	async updateVitalHistory(id: string, dto: UpdateVitalHistoryDto) {
		return this.vitalHistoriesService.update(id, dto);
	}

	async deleteVitalHistory(id: string) {
		return this.vitalHistoriesService.remove(id);
	}

	async findAllPatients(query: FilterPatientsDto) {
		return this.patientsService.findAll(query);
	}

	async findAllPatientsNoPaginate(query: FilterPatientsNoPaginateDto) {
		return this.patientsService.findAllNoPaginate(query);
	}

	async createPatientAppointment(
		patientId: string,
		personnelId: string,
		facilityId: string,
		dto: CreatePatientAppointmentDto,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		const appointmentId =
			await this.appointmentsService.createPatientAppointment(
				dto,
				patientId,
				personnelId,
				facilityId,
			);

		this.pushService.sendNotification(
			() => ({
				notification: {
					title: 'New Appointment Scheduled',
					body: `You have a new appointment: ${dto.title}.`,
				},
				data: {
					notification_type: 'notification',
					click_action: 'FLUTTER_NOTIFICATION_CLICK',
				},
			}),
			patient.userId,
		);

		return appointmentId;
	}

	async findPatientAppointments(
		patientId: string,
		query: GetAppointmentsQueryDto,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		return this.appointmentsService.findClientAppointments(
			query,
			patient.userId,
		);
	}

	async cancelPatientAppointment(
		patientId: string,
		appointmentId: string,
		personnelId: string,
		dto: CancelAppointmentDto,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		return this.appointmentsService.cancelAppointment(
			appointmentId,
			personnelId,
			dto,
		);
	}

	async reschedulePatientAppointment(
		patientId: string,
		appointmentId: string,
		personnelId: string,
		dto: RescheduleAppointmentDto,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		return this.appointmentsService.rescheduleAppointment(
			appointmentId,
			personnelId,
			dto,
		);
	}

	async completePatientAppointment(
		patientId: string,
		appointmentId: string,
		personnelId: string,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		return this.appointmentsService.completeAppointment(
			appointmentId,
			personnelId,
		);
	}

	async findPatientAppointmentRequests(
		patientId: string,
		facilityId: string,
		query: GetAppointmentRequestsQueryDto,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'_id',
		);
		if (!patient) throw new NotFoundException('Patient not found');
		return this.appointmentRequestsService.findAllForFacility(
			facilityId,
			patientId,
			query,
		);
	}

	async findPatientAppointmentRequest(patientId: string, id: string) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'_id',
		);
		if (!patient) throw new NotFoundException('Patient not found');
		const request = await this.appointmentRequestsService.findOne(id);
		if (!request) throw new NotFoundException('Appointment request not found');
		return request;
	}

	async updatePatientAppointmentRequestStatus(
		patientId: string,
		id: string,
		dto: UpdateAppointmentRequestStatusDto,
		personnelId: string,
		facilityId: string,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'_id userId',
		);
		if (!patient) throw new NotFoundException('Patient not found');

		const request = await this.appointmentRequestsService.findOne(id);
		if (!request) throw new NotFoundException('Appointment request not found');

		const updated = await this.appointmentRequestsService.update(id, {
			status: dto.status,
		});
		if (!updated) throw new NotFoundException('Appointment request not found');

		if (dto.status === AppointmentRequestStatus.APPROVED) {
			await this.appointmentsService.createPatientAppointment(
				{
					title: `${request.type} Appointment`,
					description: request.description,
					appointmentDate: request.preferredDate?.toISOString(),
				},
				patientId,
				personnelId,
				facilityId,
			);
		}

		const isApproved = dto.status === AppointmentRequestStatus.APPROVED;
		this.pushService.sendNotification(
			() => ({
				notification: {
					title: 'Appointment Request Update',
					body: isApproved
						? 'Your appointment request has been approved.'
						: 'Your appointment request has been rejected.',
				},
				data: {
					notification_type: 'notification',
					status: dto.status,
					click_action: 'FLUTTER_NOTIFICATION_CLICK',
				},
			}),
			patient.userId,
		);

		return updated._id;
	}

	async deletePatientAppointmentRequest(patientId: string, id: string) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'_id',
		);
		if (!patient) throw new NotFoundException('Patient not found');
		const request = await this.appointmentRequestsService.findOne(id);
		if (!request) throw new NotFoundException('Appointment request not found');
		return this.appointmentRequestsService.remove(id);
	}

	async findPatientSymptoms(
		patientId: string,
		facilityId: string,
		query: GetSymptomsQueryDto,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'_id',
		);
		if (!patient) throw new NotFoundException('Patient not found');
		return this.concernsService.findAllSymptomsForFacility(
			facilityId,
			patientId,
			query,
		);
	}

	async findPatientSymptom(patientId: string, facilityId: string, id: string) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'_id',
		);
		if (!patient) throw new NotFoundException('Patient not found');
		return this.concernsService.findSymptomForFacility(
			facilityId,
			patientId,
			id,
		);
	}

	async updatePatientSymptom(
		patientId: string,
		facilityId: string,
		id: string,
		dto: UpdateConcernDto,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'_id',
		);
		if (!patient) throw new NotFoundException('Patient not found');
		const symptom = await this.concernsService.updateSymptomForFacility(
			facilityId,
			patientId,
			id,
			dto,
		);
		return symptom._id;
	}

	async deletePatientSymptom(
		patientId: string,
		facilityId: string,
		id: string,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'_id',
		);
		if (!patient) throw new NotFoundException('Patient not found');
		return this.concernsService.deleteSymptomForFacility(
			facilityId,
			patientId,
			id,
		);
	}

	async resolvePatientSymptom(
		patientId: string,
		facilityId: string,
		id: string,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'_id',
		);
		if (!patient) throw new NotFoundException('Patient not found');
		const symptom = await this.concernsService.resolveSymptomForFacility(
			facilityId,
			patientId,
			id,
		);
		return symptom._id;
	}

	async findPatientVitalHistoryLogs(
		patientId: string,
		query: ChronicCareQueryDto,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		const { pageFilter } = generateFilter(query);

		return this.vitalHistoriesService.listVitalHistoryLogs(
			patient.userId,
			pageFilter.offset,
			pageFilter.limit,
		);
	}

	async findVitalHistoryLogById(patientId: string, id: string) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		return this.vitalHistoriesService.findVitalLogById(patient.userId, id);
	}

	async updateVitalHistoryLog(
		patientId: string,
		id: string,
		dto: UpdateVitalLogDto,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		const log = await this.vitalHistoriesService.updateVitalLog(
			patient.userId,
			id,
			dto,
		);
		return log._id;
	}

	async findPatientVitalTrends(
		patientId: string,
		query: VitalHistoryTrendsQueryDto,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		return this.vitalHistoriesService.fetchVitalTrend(patient.userId, query);
	}

	async findPatientBpTrends(patientId: string, query: BpTrendsQueryDto) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		return this.vitalHistoriesService.fetchBPTrend(patient.userId, query);
	}

	async findPatientMedicationAdherenceLogs(
		patientId: string,
		medicationId: string,
		query: AdherenceLogsQueryDto,
	): Promise<MedicationAdherenceLogsDto> {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		const medication = await this.medicationsService.findById(medicationId);
		const date = new Date(query.date);

		const logs = await this.adherencesService.findAdherenceLogsByTarget(
			patient.userId,
			TargetType.MEDICATION,
			medication.name,
			31,
			date,
		);

		const monthStart = startOfMonth(date);
		const monthEnd = endOfMonth(date);
		const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

		const logMap = new Map<number, { taken: boolean; id: string }>();
		for (const log of logs) {
			logMap.set(getDate(log.takenAt), { taken: log.taken, id: log.id });
		}

		const normalizedLogs: {
			takenAt: Date;
			taken: boolean | null;
			id: string;
		}[] = [];

		for (const dayDate of allDays) {
			const day = getDate(dayDate);
			const entry = logMap.get(day);

			if (entry) {
				normalizedLogs.push({
					takenAt: dayDate,
					taken: entry.taken,
					id: entry.id,
				});
			} else {
				const isPending = isFuture(dayDate) || isToday(dayDate);
				normalizedLogs.push({
					takenAt: dayDate,
					taken: isPending ? null : false,
					id: new Types.ObjectId().toString(),
				});
			}
		}

		const takenCount = normalizedLogs.filter((l) => l.taken === true).length;
		const adherenceRate = Math.round((takenCount / allDays.length) * 100);

		return {
			medicationName: medication.name,
			adherenceRate,
			logs: normalizedLogs,
		};
	}

	async findPatientMedications(patientId: string, query: ChronicCareQueryDto) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		const { pageFilter } = generateFilter(query);

		const medications = await this.medicationsService.findByUserId(
			patient.userId,
			pageFilter.offset,
			pageFilter.limit,
		);

		const count = await this.medicationsService.countByUserId(patient.userId);

		return { medications: medications || [], count };
	}

	async fetchLatestPatientVitals(patientId: string) {
		return this.patientsService.fetchLatestPatientVitals(patientId);
	}

	async createPatient(dto: UpdatePatientDto) {
		return this.patientsService.createByPersonnel(dto);
	}

	async updatePatient(id: string, dto: UpdatePatientDto) {
		return this.patientsService.updatePatient(id, dto);
	}

	async findOnePatient(id: string) {
		const patient = await this.patientsService.findOne(id);
		const plain = patient.toObject();
		const facility = plain.facility as any;

		const criticalReadingsCount =
			await this.vitalHistoriesService.countVitalsBySeverity(
				plain.userId,
				VitalSeverityEnum.CRITICAL,
			);

		return {
			...plain,
			facility: facility
				? { id: facility._id.toString(), name: facility.name }
				: undefined,
			criticalReadingsCount,
			assignedToYou: false,
		};
	}
}
