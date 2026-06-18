import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { deleteByPattern } from '@/core/caching/utils';
import {
	Frequency,
	FrequencySchema,
} from '@/features/notifications/entities/notification.entity';
import { BaseDH } from '../../../common/entities/base-dh.entity';
import { AdherenceLog } from '../../adherences/entities/adherence-log.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { myEmitter } from '../../patients/utils/summary.event';
import { Sections } from '../../patients/utils/summary.util';

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
export class Medication extends BaseDH {
	@Prop({
		required: true,
		description: 'User ID associated with the medication (3–50 characters)',
	})
	userId: string;

	@Prop({
		index: true,
		type: ObjectId,
		ref: 'Patient',
		description:
			'Patient ID (MongoDB ObjectId) associated with this medication',
	})
	patient: Patient;

	@Prop({ description: 'Name of the medication (e.g., Metformin)' })
	name: string;

	@Prop({ description: 'Quantity prescribed (numeric)' })
	quantity: number;

	@Prop({ description: 'At what quantity should a refill reminder be sent' })
	refillReminder: number;

	@Prop({ description: 'Unit of quantity (e.g., tablets, ml, capsules)' })
	quantityUnit: string;

	@Prop({ description: 'Dosage information (e.g., 500mg)' })
	dosage: string;

	@Prop({
		type: FrequencySchema,
		description:
			'Settings for medication frequency. Example: { repeatEvery: 2, repetitionType: daily }',
	})
	frequency: Frequency;

	@Prop({ description: 'Route of administration (e.g., oral, injection)' })
	route: string;

	@Prop({ description: 'Start date of medication (YYYY-MM-DD)' })
	startDate: Date;

	@Prop({ description: 'End date of medication (YYYY-MM-DD, optional)' })
	endDate: Date;

	@Prop({ description: 'Prescriber name (2–100 characters, e.g., Dr. Smith)' })
	prescribedBy: string;

	@Prop({
		description: 'Purpose of the medication (e.g., Blood pressure control)',
	})
	purpose: string;

	@Prop({
		type: [String],
		description:
			"Possible side effects (array of strings, e.g., ['Nausea', 'Headache'])",
	})
	sideEffects: string[];

	@Prop({
		type: [ObjectId],
		ref: 'AdherenceLog',
		description: 'Array of adherence log references for this medication',
	})
	adherenceLogs: AdherenceLog[];
}

export const MedicationSchema = SchemaFactory.createForClass(Medication);

MedicationSchema.post<Medication>('save', async function (doc) {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=${doc.userId}*chronic-care*medications*`,
	);
});

MedicationSchema.post<Medication>(
	'findOneAndUpdate',
	async function (doc: Medication | null) {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=${doc ? doc.userId : ''}*chronic-care*medications*`,
		);
		if (doc) {
			myEmitter.emit(
				'upsertSummary',
				Sections.MEDICATIONS,
				{
					[Sections.MEDICATIONS]: {
						data: doc,
						model: doc.model('Medication'),
					},
				},
				{ patientId: doc.patient, userId: doc.userId },
				doc.model('Summary'),
				doc.model('AugurNotification'),
			);
		}
	},
);

MedicationSchema.post<Medication>('findOneAndDelete', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*medications*`,
	);
});

MedicationSchema.post<Medication>('deleteMany', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*medications*`,
	);
});
