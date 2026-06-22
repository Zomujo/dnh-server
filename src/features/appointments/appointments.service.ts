import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { generateFilter } from '@/common/factory';
import { PatientsService } from '@/features/patients/patients.service';
import {
	AppointmentFilter,
	AppointmentStatus,
	CreateAppointmentDto,
	GetAppointmentsQueryDto,
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

	private applyFilter(query: GetAppointmentsQueryDto, userId?: string) {
		const now = new Date();
		const filter: Record<string, any> = {};
		if (userId) filter.userId = userId;

		if (query.filter === AppointmentFilter.UPCOMING) {
			filter.appointmentDate = { $gte: now };
		} else if (query.filter === AppointmentFilter.PAST) {
			filter.appointmentDate = { $lt: now };
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

	remove(id: number) {
		return `This action removes a #${id} appointment`;
	}
}
