import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities';
import { deleteByPattern } from '@/core/caching/utils';
import { Patient } from '../../patients/entities/patient.entity';

export enum PatternTargetType {
	MEDICATION = 'medication',
	EXERCISE = 'exercise',
	DIET = 'diet',
	VITALS = 'vitals',
	APPOINTMENT = 'appointment',
	OTHER = 'other',
	OVERVIEW = 'overview',
}

@Schema({
	timestamps: true,
	toJSON: {
		transform: (_doc, ret: any) => {
			const id = ret._id;
			delete ret._id;
			delete ret.__v;
			return { id, ...ret };
		},
	},
})
export class AdherencePattern extends BaseEntity {
	@Prop({
		required: true,
		description:
			'User ID associated with the adherence pattern (3–50 characters)',
	})
	userId: string;

	@Prop({
		index: true,
		type: ObjectId,
		ref: 'Patient',
		description: 'Patient ID (MongoDB ObjectId) associated with this pattern',
	})
	patient: Patient;

	@Prop({
		type: String,
		enum: PatternTargetType,
		description: 'Type of target: medication, lifestyle, or therapy',
	})
	targetType: PatternTargetType;

	@Prop({
		description: 'Name of the target (e.g., medication name, lifestyle habit)',
	})
	targetName: string;

	@Prop({ description: 'Adherence rate as a percentage (0–100)' })
	adherenceRate: number;

	@Prop({
		index: true,
		description: 'Date and time when adherence was last logged (ISO string)',
	})
	lastLoggedAt: Date;

	@Prop({
		description:
			'AI-generated additional notes about the adherence pattern (optional, up to 500 characters)',
	})
	notes: string;
}

export const AdherencePatternSchema =
	SchemaFactory.createForClass(AdherencePattern);

AdherencePatternSchema.post<AdherencePattern>('save', async function (doc) {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=${doc.userId}*chronic-care*adherence-patterns*`,
	);
});

AdherencePatternSchema.post<AdherencePattern>(
	'findOneAndUpdate',
	async function (doc: AdherencePattern | null) {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=${doc ? doc.userId : ''}*chronic-care*adherence-patterns*`,
		);
	},
);

AdherencePatternSchema.post<AdherencePattern>(
	'findOneAndDelete',
	async function () {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=*chronic-care*adherence-patterns*`,
		);
	},
);

AdherencePatternSchema.post<AdherencePattern>('deleteMany', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*adherence-patterns*`,
	);
});
