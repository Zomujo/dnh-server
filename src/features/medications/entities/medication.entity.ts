import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import {
	AugurNotification,
	Frequency,
	FrequencySchema,
} from '@/features/notifications/entities/notification.entity';
import { BaseDH } from '../../../common/entities/base-dh.entity';
import { AdherenceLog } from '../../adherences/entities/adherence-log.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { myEmitter } from '../../patients/utils/summary.event';
import { Sections } from '../../patients/utils/summary.util';

@Schema({ _id: false })
export class TimeDesignator {
	@Prop({ description: 'Hour (0-23)' })
	hour: number;

	@Prop({ description: 'Minutes (0-59)' })
	minutes: number;

	@Prop({
		type: String,
		enum: ['AM', 'PM'],
		description: 'Time designator (AM/PM)',
	})
	timeDesignators: 'AM' | 'PM';
}

export const TimeDesignatorSchema =
	SchemaFactory.createForClass(TimeDesignator);

@Schema({ _id: false })
class DosingQuantity {
	@Prop({ description: 'Quantity value' })
	value: number;

	@Prop({ description: 'Quantity unit (e.g., tablet, ml)' })
	unit: string;
}

const DosingQuantitySchema = SchemaFactory.createForClass(DosingQuantity);

@Schema({ _id: false })
export class DosingSchedule {
	@Prop({ type: TimeDesignatorSchema, description: 'Time of day' })
	time: TimeDesignator;

	@Prop({ type: DosingQuantitySchema, description: 'Dosage quantity' })
	quantity: DosingQuantity;

	@Prop({
		type: ObjectId,
		ref: 'AugurNotification',
		description:
			'AugurNotification ObjectId associated with this dosing schedule',
	})
	notification?: AugurNotification;
}

export const DosingScheduleSchema =
	SchemaFactory.createForClass(DosingSchedule);

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

	@Prop({ description: 'Start date and time of medication (YYYY-MM-DD)' })
	startDate: Date;

	@Prop({
		description: 'End date and time of medication (YYYY-MM-DD, optional)',
	})
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

	@Prop({ description: 'Notes about the medication (e.g., Take with food)' })
	notes: string;

	@Prop({
		type: DosingScheduleSchema,
		description: 'Morning dosing schedule',
	})
	morning?: DosingSchedule;

	@Prop({
		type: DosingScheduleSchema,
		description: 'Afternoon dosing schedule',
	})
	afternoon?: DosingSchedule;

	@Prop({
		type: DosingScheduleSchema,
		description: 'Evening dosing schedule',
	})
	evening?: DosingSchedule;

	@Prop({
		type: [ObjectId],
		ref: 'AdherenceLog',
		description: 'Array of adherence log references for this medication',
	})
	adherenceLogs: AdherenceLog[];
}

export const MedicationSchema = SchemaFactory.createForClass(Medication);

MedicationSchema.post<Medication>(
	'findOneAndUpdate',
	async function (doc: Medication | null) {
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
