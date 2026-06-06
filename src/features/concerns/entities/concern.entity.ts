import { Prop, Schema, SchemaFactory, Virtual } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { deleteByPattern } from '@/core/caching/utils';
import { BaseDH } from '../../../common/entities/base-dh.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { myEmitter } from '../../patients/utils/summary.event';
import { Sections } from '../../patients/utils/summary.util';
import { ConcernNameTypeMap } from '../dto';

export enum ConcernTypeEnum {
	SYMPTOMS = 'symptoms',
	SIDE_EFFECT = 'sideEffect',
	MENTAL_HEALTH = 'mentalHealth',
	GENERAL = 'general',
	OTHER = 'other',
}

export enum ConcernSeverityEnum {
	MILD = 'mild',
	MODERATE = 'moderate',
	SEVERE = 'severe',
}

@Schema({
	timestamps: true,
	toJSON: {
		virtuals: true,
		transform: (_doc, ret: any) => {
			const id = ret._id;
			delete ret._id;
			delete ret.__v;
			return { id, ...ret };
		},
	},
})
export class Concern extends BaseDH {
	@Prop({ description: 'User ID who raised the concern (3–50 characters)' })
	userId: string;

	@Prop({
		index: true,
		type: ObjectId,
		ref: 'Patient',
		description: 'Patient ID (MongoDB ObjectId) associated with this concern',
	})
	patient: Patient;

	@Prop({
		type: String,
		enum: ConcernTypeEnum,
		description:
			'Type of concern: symptom, side_effect, mental_health, general, or other',
	})
	concernType: ConcernTypeEnum;

	@Virtual({
		get: function (this: Concern) {
			return ConcernNameTypeMap[this.concernType];
		},
	})
	concernName: string;

	@Prop({
		type: [String],
		description:
			'Descriptions of the concern (at least one, e.g., [Headache, Nausea])',
	})
	description: string[];

	@Prop({
		type: String,
		enum: ConcernSeverityEnum,
		description: 'Severity of the concern: mild, moderate, or severe',
	})
	severity: ConcernSeverityEnum;

	@Prop({ description: 'Date when the concern started (YYYY-MM-DD)' })
	onsetDate: Date;

	@Prop({
		default: false,
		description: 'Whether the concern has been resolved (true/false)',
	})
	resolved: boolean;

	@Prop({
		description:
			'AI-generated supportive suggestions or guidance. Not medical instructions, but gentle recommendations or next steps inferred from context.',
	})
	notes: string;
}

export const ConcernSchema = SchemaFactory.createForClass(Concern);

ConcernSchema.post<Concern>('save', async function (doc) {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=${doc.userId}*chronic-care*concerns*`,
	);
});

ConcernSchema.post<Concern>(
	'findOneAndUpdate',
	async function (doc: Concern | null) {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=${doc ? doc.userId : ''}*chronic-care*concerns*`,
		);
		if (doc) {
			myEmitter.emit(
				'upsertSummary',
				Sections.CONCERNS,
				{
					[Sections.CONCERNS]: {
						data: doc,
						model: doc.model('Concern'),
					},
				},
				{ patientId: doc.patient, userId: doc.userId },
				doc.model('Summary'),
				doc.model('AugurNotification'),
			);
		}
	},
);

ConcernSchema.post<Concern>('findOneAndDelete', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*concerns*`,
	);
});

ConcernSchema.post<Concern>('deleteMany', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*concerns*`,
	);
});
