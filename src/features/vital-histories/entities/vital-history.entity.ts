import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { BaseDH } from '../../../common/entities/base-dh.entity';
import { Personnel } from '../../doctors/entities/personnel.entity';
import { Facility } from '../../facilities/entities/facility.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { myEmitter } from '../../patients/utils/summary.event';
import { Sections } from '../../patients/utils/summary.util';
import { VitalTypes } from '../dto/vital-history.dto';

export enum VitalSeverityEnum {
	NORMAL = 'normal',
	ELEVATED = 'elevated',

	// Blood pressure specific (AHA thresholds)
	HYPERTENSIVE = 'hypertensive',
	HYPERTENSIVE_CRISIS = 'hypertensive_crisis',
	HYPOTENSIVE = 'hypotensive',
	SEVERE_HYPOTENSION = 'severe_hypotension',

	// Blood sugar specific (ADA thresholds)
	LOW = 'low',
	CRITICALLY_LOW = 'critically_low',
	HIGH = 'high',
	CRITICALLY_HIGH = 'critically_high',

	// Legacy value, kept for existing stored records and any vital type
	// without dedicated tiers (heart rate, temperature, etc. — determineSeverity
	// doesn't classify those beyond NORMAL).
	CRITICAL = 'critical',
}

// The tiers that represent a genuine emergency — used to gate the urgent
// facility push alert and the "critical readings" count, as opposed to
// ELEVATED/HYPERTENSIVE/HYPOTENSIVE/LOW/HIGH, which are worth recording but
// don't warrant an urgent interruption.
export const CRITICAL_VITAL_SEVERITIES: VitalSeverityEnum[] = [
	VitalSeverityEnum.CRITICAL,
	VitalSeverityEnum.HYPERTENSIVE_CRISIS,
	VitalSeverityEnum.SEVERE_HYPOTENSION,
	VitalSeverityEnum.CRITICALLY_LOW,
	VitalSeverityEnum.CRITICALLY_HIGH,
];

export enum BloodSugarSubTypeEnum {
	RANDOM_BLOOD_SUGAR = 'randomBloodSugar',
	FASTING_BLOOD_SUGAR = 'fastingBloodSugar',
	ORAL_GLUCOSE_TT = 'oralGlucoseTt',
	POST_PRANDIAL = 'postPrandial',
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
export class VitalHistory extends BaseDH {
	@Prop({
		required: true,
		description:
			"User ID associated with the vital history. Example: 'user_12345'",
	})
	userId: string;

	@Prop({
		index: true,
		type: ObjectId,
		ref: 'Patient',
		description:
			"Patient ID (MongoDB ObjectId). Example: '664b7f8e2c2a1e4b8f1d2c3a4'",
	})
	patient: Patient;

	@Prop({
		index: true,
		type: String,
		enum: VitalTypes,
		description: "Type of vital sign being recorded. Example: 'bloodPressure'",
	})
	vitalType: VitalTypes;

	@Prop({
		index: true,
		type: String,
		enum: BloodSugarSubTypeEnum,
		description:
			"Subtype of vital sign. Example: If vitalType is bloodGlucose then 'randomBloodSugar', 'fastingBloodSugar', 'oralGlucoseTt', 'postPrandial'",
	})
	vitalSubType: BloodSugarSubTypeEnum;

	@Prop({
		description:
			"Measured value of the vital sign. Example: '120/80'. If vital sign is weight convert to kg",
	})
	value: string;

	@Prop({
		description:
			"Unit of measurement for the vital sign. Example: 'mmHg'. If weight, convert to kg. If blood sugar, convert to mmol/L unless already stated as such.",
	})
	unit: string;

	@Prop({
		type: String,
		enum: VitalSeverityEnum,
		description:
			'Determined severity of the vital sign based on the value and vital type',
	})
	severity: VitalSeverityEnum;

	@Prop({
		description:
			'AI-generated reasoning or interpretation of the vital sign value. Example: Blood pressure is within the normal range for an adult.',
	})
	reasoning: string;

	@Prop({
		index: true,
		description:
			"ISO date-time when the vital was recorded. Example: '2024-06-01T10:30:00.000Z'",
	})
	recordedAt: Date;

	@Prop({
		description:
			'AI-generated additional notes about the measurement context. Example: Patient was resting during measurement.',
	})
	notes: string;

	@Prop({
		type: ObjectId,
		description: 'Cluster ID for grouping related vital records',
	})
	clusterId: string;

	@Prop({
		type: ObjectId,
		ref: 'Personnel',
		description: 'ID of the personnel who created this vital history record',
	})
	createdBy: Personnel;

	@Prop({
		type: ObjectId,
		ref: 'Facility',
		description:
			'Facility the recording personnel belonged to at creation time',
	})
	facility: Facility;
}

export const VitalHistorySchema = SchemaFactory.createForClass(VitalHistory);

VitalHistorySchema.post<VitalHistory>(
	'findOneAndUpdate',
	async function (doc: VitalHistory | null) {
		if (doc) {
			myEmitter.emit(
				'upsertSummary',
				Sections.VITAL_HISTORIES,
				{
					[Sections.VITAL_HISTORIES]: {
						data: doc,
						model: doc.model('VitalHistory'),
					},
				},
				{ patientId: doc.patient, userId: doc.userId },
				doc.model('Summary'),
				doc.model('AugurNotification'),
			);
		}
	},
);
