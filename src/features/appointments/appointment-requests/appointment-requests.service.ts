import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { generateFilter } from '@/common/factory';
import {
	CreateAppointmentRequestDto,
	GetAppointmentRequestsQueryDto,
	UpdateAppointmentRequestDto,
} from './dto';
import { AppointmentRequest } from './entities/appointment-request.entity';

@Injectable()
export class AppointmentRequestsService {
	constructor(
		@InjectModel(AppointmentRequest.name)
		private readonly appointmentRequestModel: Model<AppointmentRequest>,
	) {}

	create(dto: CreateAppointmentRequestDto & { patient?: Types.ObjectId }) {
		return this.appointmentRequestModel.create(dto);
	}

	async findAll(query: GetAppointmentRequestsQueryDto, patientId?: string) {
		const { pageFilter } = generateFilter(query);
		pageFilter.orderBy = { createdAt: -1 };

		const filter: Record<string, any> = {};
		if (patientId) filter.patient = new Types.ObjectId(patientId);

		const [rows, count] = await Promise.all([
			this.appointmentRequestModel
				.find(filter)
				.skip(pageFilter.offset)
				.limit(pageFilter.limit)
				.sort(pageFilter.orderBy),
			this.appointmentRequestModel.countDocuments(filter),
		]);

		return { rows, count };
	}

	findOne(id: string) {
		return this.appointmentRequestModel.findById(id);
	}

	update(id: string, dto: UpdateAppointmentRequestDto) {
		return this.appointmentRequestModel.findByIdAndUpdate(id, dto, {
			new: true,
		});
	}

	remove(id: string) {
		return this.appointmentRequestModel.findByIdAndDelete(id);
	}
}
