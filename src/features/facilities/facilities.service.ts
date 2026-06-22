import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { generateFilter } from '@/common/factory';
import {
	CreateFacilityDto,
	GetFacilitiesQueryDto,
	UpdateFacilityDto,
} from './dto';
import { Facility } from './entities/facility.entity';

@Injectable()
export class FacilitiesService {
	constructor(
		@InjectModel(Facility.name)
		private readonly facilityModel: Model<Facility>,
	) {}

	async create(dto: CreateFacilityDto) {
		const facility = await this.facilityModel.create(dto);
		return facility._id.toString();
	}

	async findAll(query: GetFacilitiesQueryDto) {
		const { pageFilter } = generateFilter(query);

		const [rows, count] = await Promise.all([
			this.facilityModel
				.find()
				.skip(pageFilter.offset)
				.limit(pageFilter.limit)
				.sort(pageFilter.orderBy),
			this.facilityModel.countDocuments(),
		]);

		return { rows, count };
	}

	async findOne(id: string) {
		const facility = await this.facilityModel.findById(id);
		if (!facility) throw new NotFoundException('Facility not found');
		return facility;
	}

	async update(id: string, dto: UpdateFacilityDto) {
		const facility = await this.facilityModel.findByIdAndUpdate(id, dto, {
			new: true,
		});
		if (!facility) throw new NotFoundException('Facility not found');
		return facility._id.toString();
	}

	async remove(id: string) {
		const facility = await this.facilityModel.findByIdAndDelete(id);
		if (!facility) throw new NotFoundException('Facility not found');
		return facility;
	}
}
