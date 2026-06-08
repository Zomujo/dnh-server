import { StringOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
	concatWith,
	defer,
	finalize,
	from,
	map,
	mergeMap,
	Observable,
	of,
	tap,
} from 'rxjs';
import { v7 as uuidv7 } from 'uuid';
import { flattenMeta } from '@/common/entities';
import { generateFilter } from '@/common/factory';
import { generateCode } from '@/common/utils/helpers';
import { CacheService } from '@/core/caching/caching.service';
import { ChronicConditionsService } from '../chronic-conditions/chronic-conditions.service';
import {
	CreatePatientDto,
	FilterPatientsDto,
	FilterPatientsNoPaginateDto,
	PatientQueryFilter,
} from './dto';
import { Patient } from './entities/patient.entity';
import { Summary } from './entities/summary.entity';
import { SUMMARY_PROMPT } from './utils/summary.prompt';

@Injectable()
export class PatientsService {
	private llm: ChatGoogleGenerativeAI;

	findPatientById(id: string, projection?: string) {
		const objectId = new Types.ObjectId(id);
		return this.patientModel.findById(objectId).select(projection || '');
	}

	async updatePatientById(id: string, update: Record<string, any>) {
		const objectId = new Types.ObjectId(id);
		return this.patientModel.findByIdAndUpdate(objectId, update);
	}

	constructor(
		@InjectModel(Patient.name) private patientModel: Model<Patient>,
		@InjectModel(Summary.name) private summaryModel: Model<Summary>,
		private readonly chronicConditionsService: ChronicConditionsService,
		private readonly summaryCacheService: CacheService<string>,
	) {
		this.llm = new ChatGoogleGenerativeAI({
			model: 'gemini-2.5-flash',
			temperature: 0.7,
			streaming: true,
		});
	}

	async create(dto: CreatePatientDto) {
		dto.patientCode = generateCode();
		const patient = await this.patientModel.create({ ...dto });

		await Promise.all(
			dto.chronicConditions.map((conditionName) =>
				this.chronicConditionsService.upsertChronicCondition(
					{
						userId: dto.userId,
						patient: patient._id.toString(),
						conditionName,
					},
					{
						userId: dto.userId,
						patient: patient._id.toString(),
						conditionName,
					},
				),
			),
		);

		return patient._id;
	}

	async upsertPatient(filters: Record<string, any>, dto: Record<string, any>) {
		const qdrantId = uuidv7();

		const patient = await this.patientModel.findOneAndUpdate(
			{ ...filters },
			{
				$set: { ...dto },
				$setOnInsert: { qdrantId },
			},
			{
				returnDocument: 'after',
				upsert: true,
			},
		);
		// const summary = this.generatePatientSummary(patient);
		//
		// await this.dhVectorsService.create({
		// 	qdrantId: patient.qdrantId,
		// 	userId: filters.userId,
		// 	patient: patient._id.toString(),
		// 	documentType: DHDocumentType.PATIENT,
		// 	documentId: patient._id.toString(),
		// 	summary,
		// });

		return patient._id;
	}

	private generatePatientSummary(patient: Partial<Patient>): string {
		const parts: string[] = [];

		// 1. Basic Demographics & Vital Identity
		const age = patient.yearOfBirth
			? `${new Date().getFullYear() - patient.yearOfBirth} years old`
			: 'unknown age';

		parts.push(
			`Patient Profile: ${patient.name || 'Unknown'}, a ${age} ${patient.gender || ''}. ` +
				`Primary language: ${patient.language}.`,
		);

		// 2. Physical & Biological Markers
		if (patient.bloodType || patient.height) {
			parts.push(
				`Biological markers: Blood type ${patient.bloodType || 'unknown'}, ` +
					`height ${patient.height ? patient.height + 'cm' : 'not recorded'}.`,
			);
		}

		// 3. Critical Safety Information (High priority for embeddings)
		if (patient.allergies && patient.allergies.length > 0) {
			parts.push(
				`CRITICAL: Patient has known allergies to: ${patient.allergies.join(', ')}.`,
			);
		} else {
			parts.push(`No known allergies reported.`);
		}

		// 4. Lifestyle & Social History (Crucial for diagnosis/risk)
		const lifestyle = [
			patient.smokingStatus ? `Smoking status: ${patient.smokingStatus}` : null,
			patient.alcoholUse ? `Alcohol use: ${patient.alcoholUse}` : null,
			patient.pregnancyStatus === 'pregnant'
				? `Current status: Pregnant`
				: null,
		]
			.filter(Boolean)
			.join('; ');

		if (lifestyle) parts.push(`Lifestyle factors: ${lifestyle}.`);

		// 5. Care Team & Coordination
		if (patient.primaryPhysician) {
			parts.push(`Primary care managed by ${patient.primaryPhysician}.`);
		}

		// 6. Qualitative Notes
		if (patient.notes) {
			parts.push(`Additional clinical observations: ${patient.notes}`);
		}

		if (patient.meta) {
			const flatMeta = flattenMeta(patient.meta);
			parts.push(`Additional clinical observations: ${flatMeta}`);
		}

		if (patient.createdAt && patient.updatedAt) {
			parts.push(
				`Patient Profile Created At: ${new Date(patient.createdAt).toLocaleString()} and Updated At: ${new Date(patient.updatedAt).toLocaleString()}`,
			);
		}

		return parts.join(' ');
	}

	async findAllByQuery(filters: PatientQueryFilter) {
		let query = this.patientModel
			.find(filters.query)
			.limit(filters.limit ?? 10)
			.sort({ createdAt: -1 });

		if (filters.projection) {
			query = query.select(filters.projection);
		}

		const results = await query.lean();

		return results;
	}

	async findAll(query: FilterPatientsDto) {
		let { pageFilter, searchFilter } = generateFilter(query);
		const findFilter: Record<string, any> = {};
		if (query.personnelId) {
			findFilter.pharmaciesVisited = query.personnelId;
		}

		searchFilter = { ...searchFilter, ...findFilter };

		const patients = await this.patientModel
			.find({ ...searchFilter })
			.skip(pageFilter.offset)
			.limit(pageFilter.limit)
			.sort(pageFilter.orderBy)
			.select('-pharmaciesVisited -doctorsVisited -qdrantId');

		const count = await this.patientModel.countDocuments({ ...searchFilter });

		return { rows: patients, count };
	}

	async findAllNoPaginate(query: FilterPatientsNoPaginateDto) {
		const { searchFilter } = generateFilter(query);

		const patients = await this.patientModel
			.find({ ...searchFilter })
			.select('userId name patientCode');

		return patients;
	}

	async findOne(userId: string) {
		const patientId = new Types.ObjectId(userId);
		const patient = await this.patientModel
			.findOne({
				$or: [{ userId }, { _id: patientId }],
			})
			.select('-pharmaciesVisited -doctorsVisited -qdrantId');

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		return patient;
	}

	async findPatientByUserId(
		userId: string,
		projection?: string,
	): Promise<Patient | null> {
		return this.patientModel.findOne({ userId }).select(projection || '');
	}

	async countPatientsByUserId(userId: string): Promise<number> {
		return this.patientModel.countDocuments({ userId });
	}

	async createPatient(data: Partial<Patient>): Promise<Patient> {
		return this.patientModel.create(data);
	}

	async removePatientsByUserId(userId: string) {
		return this.patientModel.deleteMany({ userId });
	}

	async removeSummariesByUserId(userId: string) {
		return this.summaryModel.deleteMany({ userId });
	}

	async generateSummary(userId: string): Promise<Observable<MessageEvent>> {
		const cacheKey = `chronic-care:doctors:patients:summary:${userId}`;
		const cachedSummary = await this.summaryCacheService.get(cacheKey);

		if (cachedSummary) {
			return of(
				new MessageEvent('message', { data: cachedSummary }),
				new MessageEvent('message', { data: '\n' }),
			);
		}

		let fullSummary = '';
		return defer(async () => {
			const promptTemplate = PromptTemplate.fromTemplate(SUMMARY_PROMPT);

			const patientId = new Types.ObjectId(userId);
			const summary = await this.summaryModel
				.findOne({
					$or: [{ patient: patientId }, { userId }],
				})
				.populate({
					path: 'patient',
					select:
						'-createdAt -userId -language -timezone -emergencyContactName -emergencyContactPhone -updatedAt -__v',
				})
				.lean();

			const prompt = await promptTemplate.invoke({
				data: summary,
			});

			const stream = await this.llm
				.pipe(new StringOutputParser())
				.stream(prompt);
			return stream;
		}).pipe(
			mergeMap((asyncIterable) => from(asyncIterable)),

			tap((text) => {
				fullSummary += text;
			}),

			map((text) => new MessageEvent('message', { data: text })),

			finalize(async () => {
				if (fullSummary) {
					const env = process.env.NODE_ENV;
					const ttl = env !== 'development' ? 60000 * 60 * 6 : 60000 * 2; //6hr
					await this.summaryCacheService.set(cacheKey, fullSummary, ttl);
				}
			}),

			concatWith(of(new MessageEvent('message', { data: '\n' }))),
		);
	}
}
