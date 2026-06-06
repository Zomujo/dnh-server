import { BaseMessageChunk } from '@langchain/core/messages';
import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { defer, filter, finalize, from, map, mergeMap, Observable } from 'rxjs';
import { generateFilter } from '@/common/factory';
import { CacheService } from '@/core/caching/caching.service';
import { DoctorsService } from '@/features/doctors/doctors.service';
import { PatientsService } from '@/features/patients/patients.service';
import {
	CreatePlannerDto,
	GetPlannerChatQueryDto,
	StreamCompletionInput,
	UpdatePlannerDto,
} from './dto';
import { PlannerChat } from './entities/planner-chat.entity';
import { PlannerAiService } from './planner-ai.service';

@Injectable()
export class PlannerService {
	constructor(
		private readonly plannerAiService: PlannerAiService,
		@InjectModel(PlannerChat.name)
		private readonly plannerChatModel: Model<PlannerChat>,
		private readonly patientsService: PatientsService,
		private readonly doctorsService: DoctorsService,
		private eventEmitter: EventEmitter2,
		private readonly patPersCacheService: CacheService<{
			patient: any;
			personnel: any;
		}>,
	) {}

	async chat(
		createPlannerDto: CreatePlannerDto,
	): Promise<Observable<MessageEvent>> {
		let fullOutput = '';
		const personnelId = createPlannerDto.personnelId;
		const fromSource = 'text';
		const now = new Date();

		const [patient, personnel] = await this.fetchPatientPersonnel(
			createPlannerDto.patientId,
			personnelId,
		);

		return defer(async () => {
			const input: StreamCompletionInput = {
				message: createPlannerDto.message,
				chatType: 'text',
				sessionId: createPlannerDto.sessionId,
				patient,
				personnel,
			};

			const completion$ = await this.plannerAiService.streamCompletion(input);
			return completion$;
		}).pipe(
			mergeMap((asyncIterable) => from(asyncIterable)),

			map((chunk) => {
				const [mode, data] = chunk as
					| ['messages', [BaseMessageChunk, Record<string, any>]]
					| ['custom', Record<string, any>];
				if (mode === 'custom') {
					return new MessageEvent('progress', {
						data: data.status,
					});
				}

				if (mode === 'messages') {
					const [token, metadata] = data;
					if (!token.content) return null;
					if (metadata.langgraph_node !== 'llmCall') return null;
					fullOutput += token.content;
					return new MessageEvent('message', {
						data: token.content,
					});
				}

				return null;
			}),
			filter((event) => event !== null),
			finalize(async () => {
				if (!fullOutput || fullOutput.trim().length === 0) {
					return;
				}
				this.eventEmitter.emit('planner.state.persist', {
					humanMessage: createPlannerDto.message,
					response: fullOutput,
					personnelId: personnelId,
					sessionId: createPlannerDto.sessionId,
					chatType: 'text',
					fromSource: fromSource,
					receivedAt: now,
				});
			}),
		);
	}

	private async fetchPatientPersonnel(
		patientId: string,
		personnelId: string,
	): Promise<[any, any]> {
		const cacheData = await this.patPersCacheService.get(
			`${patientId}:${personnelId}`,
		);
		if (cacheData) {
			return [cacheData.patient, cacheData.personnel];
		}

		const patient = await this.patientsService.findPatientById(
			patientId,
			'userId',
		);
		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		const personnel = await this.doctorsService.findPersonnelById(
			personnelId,
			'userName role',
		);
		if (!personnel) {
			throw new NotFoundException('Personnel not found');
		}

		const fiftyMinsTtl = 50 * 60000;
		await this.patPersCacheService.set(
			`${patientId}:${personnelId}`,
			{ patient, personnel },
			fiftyMinsTtl,
		);

		return [patient, personnel];
	}

	async findAll(sessionId: string, query: GetPlannerChatQueryDto) {
		const { searchFilter, pageFilter } = generateFilter(query);

		const rows = await this.plannerChatModel
			.find({ ...searchFilter, plannerSession: new Types.ObjectId(sessionId) })
			.skip(pageFilter.offset)
			.limit(pageFilter.limit)
			.sort(pageFilter.orderBy);

		const count = await this.plannerChatModel.countDocuments({
			...searchFilter,
			plannerSession: new Types.ObjectId(sessionId),
		});

		return { rows, count };
	}

	listCollections() {
		return this.plannerAiService.listModels();
	}

	viewCollectionData(name: string) {
		return this.plannerAiService.listSchemas(name);
	}

	findOne(id: number) {
		return `This action returns a #${id} planner`;
	}

	update(id: number, _updatePlannerDto: UpdatePlannerDto) {
		return `This action updates a #${id} planner`;
	}

	remove(id: number) {
		return `This action removes a #${id} planner`;
	}
}
