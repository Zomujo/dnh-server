import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { generateFilter } from '@/common/factory';
import {
	GetPlannerPlanQueryDto,
	PlanIdentity,
	PlanUpsertInput,
	UpdatePlanDto,
} from './dto';
import { Plan } from './entities/plan.entity';

@Injectable()
export class PlansService {
	constructor(@InjectModel(Plan.name) private planModel: Model<Plan>) {}

	async upsertPlan(filters: PlanIdentity, input: PlanUpsertInput) {
		const plan = await this.planModel.findOneAndUpdate(
			{ ...filters },
			{
				$set: { ...input },
			},
			{
				returnDocument: 'after',
				upsert: true,
			},
		);

		return plan._id;
	}

	async findAll(patientId: string, query: GetPlannerPlanQueryDto) {
		const { searchFilter, pageFilter } = generateFilter(query);

		const rows = await this.planModel
			.find({ ...searchFilter, patient: patientId })
			.skip(pageFilter.offset)
			.limit(pageFilter.limit)
			.sort(pageFilter.orderBy);

		const count = await this.planModel.countDocuments({
			...searchFilter,
			patient: patientId,
		});

		return { rows, count };
	}

	async findOne(patientId: string, id: string) {
		const plan = await this.planModel.findOne({
			_id: new Types.ObjectId(id),
			patient: patientId,
		});
		if (!plan) {
			throw new NotFoundException(`Plan not found`);
		}
		return plan;
	}

	async update(id: string, updatePlanDto: UpdatePlanDto) {
		const { patient, ...data } = updatePlanDto;
		const plan = await this.planModel.findOneAndUpdate(
			{ _id: new Types.ObjectId(id), patient: patient },
			data,
			{ returnDocument: 'after' },
		);
		if (!plan) {
			throw new NotFoundException(`Plan not found`);
		}
		return plan._id;
	}

	async remove(patientId: string, id: string) {
		const result = await this.planModel.findOneAndDelete({
			_id: new Types.ObjectId(id),
			patient: patientId,
		});
		if (!result) {
			throw new NotFoundException(`Plan not found`);
		}

		return { id };
	}
}
