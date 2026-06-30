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
import { AppointmentsService } from '@/features/appointments/appointments.service';
import {
	CancelAppointmentDto,
	CreatePatientAppointmentDto,
	GetAppointmentsQueryDto,
	RescheduleAppointmentDto,
} from '@/features/appointments/dto';
import { ChronicCareQueryDto } from '@/features/client/dto';
import {
	AdherenceLogsQueryDto,
	MedicationAdherenceLogsDto,
} from '@/features/medications/dto';
import { MedicationsService } from '@/features/medications/medications.service';
import {
	FilterPatientsDto,
	FilterPatientsNoPaginateDto,
} from '@/features/patients/dto';
import { PatientsService } from '@/features/patients/patients.service';
import {
	BpTrendsQueryDto,
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
	) {}

	async findAllPatients(query: FilterPatientsDto) {
		return this.patientsService.findAll(query);
	}

	async findAllPatientsNoPaginate(query: FilterPatientsNoPaginateDto) {
		return this.patientsService.findAllNoPaginate(query);
	}

	async createPatientAppointment(
		patientId: string,
		personnelId: string,
		dto: CreatePatientAppointmentDto,
	) {
		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		return this.appointmentsService.createPatientAppointment(
			dto,
			patientId,
			personnelId,
		);
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

		return this.vitalHistoriesService.updateVitalLog(patient.userId, id, dto);
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

	async findOnePatient(id: string) {
		const patient = await this.patientsService.findOne(id);
		const plain = patient.toObject();

		const criticalReadingsCount =
			await this.vitalHistoriesService.countVitalsBySeverity(
				plain.userId,
				VitalSeverityEnum.CRITICAL,
			);

		return {
			...plain,
			criticalReadingsCount,
			assignedToYou: false,
		};
	}
}
