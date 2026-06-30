import { Prop, Schema, SchemaFactory, Virtual } from '@nestjs/mongoose';
import { differenceInYears } from 'date-fns';
import { ObjectId } from 'mongodb';
import { BaseDH } from '@/common/entities/base-dh.entity';
import { deleteByPattern } from '@/core/caching/utils';
import { Personnel } from '@/features/doctors/entities/personnel.entity';
import { AdherenceStatus } from '../dto';
import { myEmitter } from '../utils/summary.event';
import { Sections } from '../utils/summary.util';

export enum GenderEnum {
	MALE = 'male',
	FEMALE = 'female',
	OTHER = 'other',
}

export enum SmokingStatusEnum {
	CURRENT = 'current',
	FORMER = 'former',
	NEVER = 'never',
}

export enum AlcoholUseEnum {
	YES = 'yes',
	NO = 'no',
	OCCASIONAL = 'occasional',
}

export enum PregnancyStatusEnum {
	PREGNANT = 'pregnant',
	NOT_PREGNANT = 'not_pregnant',
	UNKNOWN = 'unknown',
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
export class Patient extends BaseDH {
	@Prop({ description: 'Unique patient code for identification' })
	patientCode: string;

	@Prop({
		required: true,
		description: 'The ID of the user associated with the patient',
	})
	userId: string;

	@Prop({
		description: 'Ghana card number for identification',
	})
	ghanaCardNumber: string;

	@Prop({
		description: 'National Health Insurance Scheme number',
	})
	nhisNumber: string;

	@Prop({
		default: 'English',
		description: 'Preferred language for the patient',
	})
	language: string;

	@Prop({ description: 'Full name of the patient' })
	name: string;

	@Prop({
		description:
			"Patient's phone number in strict international E.164 format. Must start with '+' followed by country code and digits (max 15). Example: '+233541234567'",
	})
	phoneNumber: string;

	@Prop({ description: 'Date of birth of the patient in MM/DD/YYYY format' })
	dateOfBirth: Date;

	@Prop({ description: 'Year of birth of the patient in YYYY format' })
	yearOfBirth: number;

	@Prop({
		type: String,
		enum: GenderEnum,
		description: 'Gender of the patient: male, female, or other',
	})
	gender: GenderEnum;

	@Prop({ description: 'Height of the patient in centimeters (min 30)' })
	height: number;

	@Prop({ description: 'Blood type of the patient (e.g., O+)' })
	bloodType: string;

	@Prop({ description: 'List of allergies (array of strings)' })
	allergies: string[];

	@Prop({ description: 'Primary physician name' })
	primaryPhysician: string;

	@Prop({ description: 'Emergency contact full name' })
	emergencyContactName: string;

	@Prop({
		description:
			'Emergency contact phone number (E.164 format, e.g., +233541234567)',
	})
	emergencyContactPhone: string;

	@Prop({
		type: String,
		enum: SmokingStatusEnum,
		description: 'Smoking status of the patient: current, former, never',
	})
	smokingStatus: SmokingStatusEnum;

	@Prop({
		type: String,
		enum: AlcoholUseEnum,
		description: 'Alcohol use status of the patient: yes, no, occasional',
	})
	alcoholUse: AlcoholUseEnum;

	@Prop({
		type: [{ type: ObjectId, ref: 'Personnel' }],
		default: [],
		description: 'Set of unique pharmacy IDs the patient has visited',
	})
	pharmaciesVisited: Personnel[];

	@Prop({
		type: [{ type: ObjectId, ref: 'Personnel' }],
		default: [],
		description: 'Set of unique doctor IDs the patient has visited',
	})
	doctorsVisited: Personnel[];

	@Prop({
		type: [String],
		default: [],
		description:
			'Set of chronic condition names the patient has been diagnosed with',
	})
	chronicConditions: string[];

	@Prop({
		description: 'Adherence rate percentage (0-100)',
	})
	adherenceRate: number;

	@Prop({
		type: String,
		enum: AdherenceStatus,
		description: 'Adherence status: critical, silent, or stable',
	})
	adherenceStatus: AdherenceStatus;

	@Prop({
		description: 'Date of the last adherence check-in',
	})
	lastCheckInDate: Date;

	@Prop({
		type: String,
		enum: PregnancyStatusEnum,
		description: 'Pregnancy status: pregnant, not_pregnant, unknown',
	})
	pregnancyStatus: PregnancyStatusEnum;

	@Prop({
		description: 'AI-generated notes about the patient (up to 500 characters)',
	})
	notes: string;

	@Prop({
		default: 'Africa/Accra',
		description: "Patient's timezone in IANA format. Example: 'Africa/Accra'",
	})
	timezone: string;

	@Virtual({
		get: function (this: Patient) {
			const age = differenceInYears(new Date(), this.dateOfBirth);
			return age;
		},
	})
	age: number;

	bmi: number;

	weight: number;
}

export const PatientSchema = SchemaFactory.createForClass(Patient);

PatientSchema.post<Patient>('save', async function (doc) {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=${doc.userId}*chronic-care*patient*`,
	);
});

PatientSchema.post<Patient>(
	'findOneAndUpdate',
	async function (doc: Patient | null) {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=${doc ? doc.userId : ''}*chronic-care*patient*`,
		);
		if (doc) {
			myEmitter.emit(
				'upsertSummary',
				Sections.PATIENT,
				{
					[Sections.PATIENT]: {
						data: doc,
						model: doc.model('Patient'),
					},
				},
				{ patientId: doc._id.toString(), userId: doc.userId },
				doc.model('Summary'),
				doc.model('AugurNotification'),
			);
		}
	},
);

PatientSchema.post<Patient>('findOneAndDelete', async function () {
	await deleteByPattern(process.env.REDIS_URL!, `token=*chronic-care*patient*`);
});

PatientSchema.post<Patient>('deleteMany', async function () {
	await deleteByPattern(process.env.REDIS_URL!, `token=*chronic-care*patient*`);
});
