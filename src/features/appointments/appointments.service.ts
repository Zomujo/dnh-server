import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { generateFilter } from '@/common/factory';
import { PatientsService } from '@/features/patients/patients.service';
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
	) {}

	async create(dto: CreateAppointmentDto) {
		const { patient: patientId, ...rest } = dto;
		const payload: any = { ...rest, status: AppointmentStatus.SCHEDULED };

		if (patientId) {
			const patient = await this.patientsService.findPatientById(patientId);
			if (!patient) throw new NotFoundException('Patient not found');
			payload.patient = new Types.ObjectId(patientId);
			payload.userId = patient.userId;
		}

		return this.appointmentModel.create(payload);
	}

	async createPatientAppointment(
		dto: CreatePatientAppointmentDto,
		patientId: string,
		personnelId: string,
	) {
		const patient = await this.patientsService.findPatientById(patientId);
		if (!patient) throw new NotFoundException('Patient not found');

		const appointment = await this.appointmentModel.create({
			...dto,
			status: AppointmentStatus.SCHEDULED,
			hostPersonnel: new Types.ObjectId(personnelId),
			userId: patient.userId,
			patient: new Types.ObjectId(patientId),
		});

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
				.select('title appointmentDate hostPersonnel')
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

		return appointment.save();
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
		appointment.rescheduledCount = (appointment.rescheduledCount ?? 0) + 1;

		return appointment.save();
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

		return appointment.save();
	}

	remove(id: number) {
		return `This action removes a #${id} appointment`;
	}
}
