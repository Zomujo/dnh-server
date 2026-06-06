import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
// import nlp from 'compromise';
import { format } from 'date-fns';
import { Model, Types } from 'mongoose';
import { generateFilter } from '@/common/factory';
import { PlannerChat } from '../entities/planner-chat.entity';
import {
	CreatePlannerSessionDto,
	GetPlannerSessionQueryDto,
	UpdatePlannerSessionDto,
} from './dto';
import { PlannerSession } from './entities/session.entity';

@Injectable()
export class SessionsService {
	constructor(
		@InjectModel(PlannerSession.name)
		private readonly plannerSessionModel: Model<PlannerSession>,
		@InjectModel(PlannerChat.name)
		private readonly plannerChatModel: Model<PlannerChat>,
	) {}

	async create(dto: CreatePlannerSessionDto) {
		const name = this.generateClinicalSessionName();
		const session = await this.plannerSessionModel.create({
			name: name,
			patient: dto.patient,
			personnel: new Types.ObjectId(dto.personnel),
		});
		return session._id;
	}

	async findAll(patientId: string, query: GetPlannerSessionQueryDto) {
		const { searchFilter, pageFilter } = generateFilter(query);

		const rows = await this.plannerSessionModel
			.find({ ...searchFilter, patient: patientId })
			.skip(pageFilter.offset)
			.limit(pageFilter.limit)
			.sort(pageFilter.orderBy);

		const count = await this.plannerSessionModel.countDocuments({
			...searchFilter,
			patient: patientId,
		});

		return { rows, count };
	}

	async findOne(patientId: string, id: string) {
		const session = await this.plannerSessionModel.findOne({
			_id: new Types.ObjectId(id),
			patient: patientId,
		});
		if (!session) {
			throw new NotFoundException(`Session not found`);
		}
		return session;
	}

	async update(id: string, updateSessionDto: UpdatePlannerSessionDto) {
		const { patient, ...data } = updateSessionDto;
		const session = await this.plannerSessionModel.findOneAndUpdate(
			{ _id: new Types.ObjectId(id), patient: patient },
			data,
			{ returnDocument: 'after' },
		);
		if (!session) {
			throw new NotFoundException(`Session not found`);
		}
		return session._id;
	}

	async remove(patientId: string, id: string) {
		const result = await this.plannerSessionModel.findOneAndDelete({
			_id: new Types.ObjectId(id),
			patient: patientId,
		});
		if (!result) {
			throw new NotFoundException(`Session not found`);
		}

		await this.plannerChatModel.deleteMany({
			plannerSession: new Types.ObjectId(id),
		});
		return { id };
	}

	/**
	 * Generates: "Plan: YYYY-MM-DD - HH:mm"
	 */
	private generateClinicalSessionName = () => {
		// const date = new Date().toISOString().split('T')[0]; // Result: 2026-03-30
		const date = format(new Date(), 'yyyy-MM-dd - HH:mm');
		//
		// let doc = nlp(input);
		//
		// let medicalSubject = doc
		// 	.match('(for|about|reviewing) [#Noun+]')
		// 	.terms()
		// 	.slice(1)
		// 	.text();
		//
		// if (!medicalSubject) {
		// 	medicalSubject = doc.nouns().slice(0, 2).text();
		// }
		//
		// if (!medicalSubject || medicalSubject.length < 3) {
		// 	medicalSubject = 'General Patient Review';
		// }
		//
		// const cleanSubject = nlp(medicalSubject).toTitleCase().text();

		return `Plan: ${date}`;
	};
}
