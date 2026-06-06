import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { deleteByPattern } from '@/core/caching/utils';
import { BaseDH } from '../../../common/entities/base-dh.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { myEmitter } from '../../patients/utils/summary.event';
import { Sections } from '../../patients/utils/summary.util';

export enum ConditionSeverityEnum {
	MILD = 'mild',
	MODERATE = 'moderate',
	SEVERE = 'severe',
}

export enum CurrentStatusEnum {
	ACTIVE = 'active',
	MANAGED = 'managed',
	RESOLVED = 'resolved',
	IN_REMISSION = 'in_remission',
}

@Schema({
	timestamps: true,
	toJSON: {
		transform: (_doc, ret: any) => {
			const id = ret._id;
			delete ret._id;
			delete ret.__v;
			delete ret.diagnosedDate._id;
			return { id, ...ret };
		},
	},
})
export class ChronicCondition extends BaseDH {
	@Prop({
		required: true,
		description:
			'User ID associated with the chronic condition (3–50 characters)',
	})
	userId: string;

	@Prop({
		index: true,
		type: ObjectId,
		ref: 'Patient',
		description: 'Patient ID (MongoDB ObjectId) associated with this condition',
	})
	patient: Patient;

	@Prop({
		description:
			'Name of the chronic condition (2–100 characters, e.g., Diabetes Mellitus)',
	})
	conditionName: string;

	@Prop({
		type: String,
		enum: ConditionSeverityEnum,
		description: 'Severity of the condition: mild, moderate, or severe',
	})
	severity: ConditionSeverityEnum;

	@Prop({
		description:
			"Indicates who made the diagnosis (doctor, pharmacist, AI, etc.). Example: 'doctor'",
	})
	diagnosedBy: string;

	@Prop({
		type: {
			day: {
				type: Number,
				required: false,
				description: 'Day of month (1–31)',
			},
			month: {
				type: Number,
				required: false,
				description: 'Month number (1–12)',
			},
			year: { type: Number, required: true, description: 'Four-digit year' },
		},
		description:
			'Date when the condition was diagnosed. Year required. Month optional. Day only allowed if month is present.',
	})
	diagnosedDate: {
		day?: number;
		month?: number;
		year: number;
	};

	@Prop({
		type: String,
		enum: CurrentStatusEnum,
		description:
			'Current status of the condition: active, managed, resolved, or in_remission',
	})
	currentStatus: CurrentStatusEnum;

	@Prop({
		description:
			'AI-generated additional notes about the condition (up to 500 characters)',
	})
	notes: string;
}

export const ChronicConditionSchema =
	SchemaFactory.createForClass(ChronicCondition);

ChronicConditionSchema.post<ChronicCondition>('save', async function (doc) {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=${doc.userId}*chronic-care*chronic-conditions*`,
	);
});

ChronicConditionSchema.post<ChronicCondition>(
	'findOneAndUpdate',
	async function (doc: ChronicCondition | null) {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=${doc ? doc.userId : ''}*chronic-care*chronic-conditions*`,
		);
		if (doc) {
			myEmitter.emit(
				'upsertSummary',
				Sections.CHRONIC_CONDITIONS,
				{
					[Sections.CHRONIC_CONDITIONS]: {
						data: doc,
						model: doc.model('ChronicCondition'),
					},
				},
				{ patientId: doc.patient, userId: doc.userId },
				doc.model('Summary'),
				doc.model('AugurNotification'),
			);
		}
	},
);

ChronicConditionSchema.post<ChronicCondition>(
	'findOneAndDelete',
	async function () {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=*chronic-care*chronic-conditions*`,
		);
	},
);

ChronicConditionSchema.post<ChronicCondition>('deleteMany', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*chronic-conditions*`,
	);
});
