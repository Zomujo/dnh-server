import { InjectQueue } from '@nestjs/bullmq';
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { generateFilter } from '@/common/factory';
import { PushService } from '@/features/notifications/push/push.service';
import { PatientsService } from '@/features/patients/patients.service';
import { APPOINTMENT_REMINDER_QUEUE } from './appointments.constants';
import {
	AppointmentFilter,
	AppointmentStatus,
	CancelAppointmentDto,
	CreateAppointmentDto,
	CreatePatientAppointmentDto,
	GetAppointmentsQueryDto,
	RescheduleAppointmentDto,
	UpdateAppointmentDto,
} from './dto';
import { Appointment } from './entities/appointment.entity';

@Injectable()
export class AppointmentsService {
	constructor(
		@InjectModel(Appointment.name)
		private readonly appointmentModel: Model<Appointment>,
		private readonly patientsService: PatientsService,
		private readonly pushService: PushService,
		@InjectQueue(APPOINTMENT_REMINDER_QUEUE)
		private readonly reminderQueue: Queue,
	) {}

	private async scheduleReminder(appointmentId: string, appointmentDate: Date) {
		const delay = new Date(appointmentDate).getTime() - Date.now();
		if (delay <= 0) return;

		await this.reminderQueue.add(
			'remind',
			{ appointmentId },
			{ delay, jobId: appointmentId },
		);
	}

	private async cancelReminder(appointmentId: string) {
		const job = await this.reminderQueue.getJob(appointmentId);
		if (job) await job.remove();
	}

	async create(dto: CreateAppointmentDto) {
		const { patient: patientId, ...rest } = dto;
		const payload: any = { ...rest, status: AppointmentStatus.SCHEDULED };

		if (patientId) {
			const patient = await this.patientsService.findPatientById(patientId);
			if (!patient) throw new NotFoundException('Patient not found');
			payload.patient = new Types.ObjectId(patientId);
			payload.userId = patient.userId;
		}

		const appointment = await this.appointmentModel.create(payload);
		await this.scheduleReminder(
			appointment._id.toString(),
			appointment.appointmentDate,
		);

		return appointment;
	}

	async createPatientAppointment(
		dto: CreatePatientAppointmentDto,
		patientId: string,
		personnelId: string,
		facilityId?: string,
	) {
		const patient = await this.patientsService.findPatientById(patientId);
		if (!patient) throw new NotFoundException('Patient not found');

		const appointment = await this.appointmentModel.create({
			...dto,
			status: AppointmentStatus.SCHEDULED,
			hostPersonnel: new Types.ObjectId(personnelId),
			userId: patient.userId,
			patient: new Types.ObjectId(patientId),
			...(facilityId && { host: new Types.ObjectId(facilityId) }),
		});

		await this.scheduleReminder(
			appointment._id.toString(),
			appointment.appointmentDate,
		);

		return appointment._id;
	}

	private applyFilter(query: GetAppointmentsQueryDto, userId?: string) {
		const now = new Date();
		const filter: Record<string, any> = {};
		if (userId) filter.userId = userId;

		if (query.filter === AppointmentFilter.UPCOMING) {
			filter.appointmentDate = { $gte: now };
		} else if (query.filter === AppointmentFilter.PAST) {
			filter.appointmentDate = { $lt: now };
		}

		if (query.status) {
			filter.status = query.status;
		}

		const sort: Record<string, 1 | -1> =
			query.filter === AppointmentFilter.PAST
				? { appointmentDate: -1 }
				: { appointmentDate: 1 };

		return { filter, sort };
	}

	async findAll(query: GetAppointmentsQueryDto, userId?: string) {
		const { pageFilter } = generateFilter(query);
		const { filter, sort } = this.applyFilter(query, userId);

		const [rows, count] = await Promise.all([
			this.appointmentModel
				.find(filter)
				.skip(pageFilter.offset)
				.limit(pageFilter.limit)
				.sort(sort),
			this.appointmentModel.countDocuments(filter),
		]);

		return { rows, count };
	}

	async findClientAppointments(
		query: GetAppointmentsQueryDto,
		userId?: string,
	) {
		const { pageFilter } = generateFilter(query);
		const { filter, sort } = this.applyFilter(query, userId);

		const [rows, count] = await Promise.all([
			this.appointmentModel
				.find(filter)
				.select('title appointmentDate status hostPersonnel')
				.populate({
					path: 'hostPersonnel',
					select: 'userName facility',
					populate: { path: 'facility', select: 'name' },
				})
				.skip(pageFilter.offset)
				.limit(pageFilter.limit)
				.sort(sort),
			this.appointmentModel.countDocuments(filter),
		]);

		return { rows, count };
	}

	findNearestAppointment(userId: string) {
		return this.appointmentModel
			.findOne({ userId, appointmentDate: { $gte: new Date() } })
			.select('title appointmentDate hostPersonnel')
			.populate({
				path: 'hostPersonnel',
				select: 'userName facility',
				populate: { path: 'facility', select: 'name' },
			})
			.sort({ appointmentDate: 1 });
	}

	findOne(id: number) {
		return `This action returns a #${id} appointment`;
	}

	update(id: number, dto: UpdateAppointmentDto) {
		return `This action updates a #${id} appointment`;
	}

	async cancelAppointment(
		id: string,
		personnelId: string,
		dto: CancelAppointmentDto,
	) {
		const appointment = await this.appointmentModel.findById(id);

		if (!appointment) {
			throw new NotFoundException('Appointment not found');
		}

		if (appointment.status === AppointmentStatus.COMPLETED) {
			throw new BadRequestException('Cannot cancel a completed appointment');
		}

		if (appointment.status === AppointmentStatus.CANCELLED) {
			throw new BadRequestException(
				'Cannot cancel an already cancelled appointment',
			);
		}

		appointment.status = AppointmentStatus.CANCELLED;
		appointment.cancelledAt = new Date();
		appointment.cancelledBy = new Types.ObjectId(personnelId) as any;
		appointment.reason = dto.reason;

		await this.cancelReminder(id);

		await appointment.save();

		if (appointment.userId) {
			this.pushService.sendNotification(
				() => ({
					notification: {
						title: 'Appointment Cancelled',
						body: `Your appointment "${appointment.title}" has been cancelled.`,
					},
					data: {
						notification_type: 'notification',
						click_action: 'FLUTTER_NOTIFICATION_CLICK',
					},
				}),
				appointment.userId,
			);
		}

		return appointment._id;
	}

	async rescheduleAppointment(
		id: string,
		personnelId: string,
		dto: RescheduleAppointmentDto,
	) {
		const appointment = await this.appointmentModel.findById(id);

		if (!appointment) {
			throw new NotFoundException('Appointment not found');
		}

		if (
			appointment.status !== AppointmentStatus.SCHEDULED &&
			appointment.status !== AppointmentStatus.RESCHEDULED
		) {
			throw new BadRequestException(
				'Only scheduled or rescheduled appointments can be rescheduled',
			);
		}

		appointment.status = AppointmentStatus.RESCHEDULED;
		appointment.rescheduledAt = new Date();
		appointment.rescheduledBy = new Types.ObjectId(personnelId) as any;
		appointment.reason = dto.reason;
		appointment.appointmentDate = new Date(dto.appointmentDate);
		appointment.rescheduledCount = (appointment.rescheduledCount ?? 0) + 1;

		await this.cancelReminder(id);
		await this.scheduleReminder(id, appointment.appointmentDate);

		await appointment.save();
		return appointment._id;
	}

	async completeAppointment(id: string, personnelId: string) {
		const appointment = await this.appointmentModel.findById(id);

		if (!appointment) {
			throw new NotFoundException('Appointment not found');
		}

		if (
			appointment.status !== AppointmentStatus.SCHEDULED &&
			appointment.status !== AppointmentStatus.RESCHEDULED
		) {
			throw new BadRequestException(
				'Only scheduled or rescheduled appointments can be completed',
			);
		}

		appointment.status = AppointmentStatus.COMPLETED;
		appointment.hostPersonnel = new Types.ObjectId(personnelId) as any;
		appointment.completedAt = new Date();

		await this.cancelReminder(id);

		await appointment.save();
		return appointment._id;
	}

	async removeByPatientId(patientId: string) {
		return this.appointmentModel.deleteMany({ patient: patientId });
	}

	remove(id: number) {
		return `This action removes a #${id} appointment`;
	}
}
