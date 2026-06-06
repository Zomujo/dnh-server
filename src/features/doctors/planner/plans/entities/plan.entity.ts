import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities';
import { deleteByPattern } from '@/core/caching/utils';
import { Personnel } from '@/features/doctors/entities/personnel.entity';
import { Patient } from '@/features/patients/entities/patient.entity';
import { PlannerSession } from '../../sessions/entities/session.entity';
import { PlanStatus } from '../dto';

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
export class Plan extends BaseEntity {
	@Prop({
		type: ObjectId,
		ref: 'Personnel',
		required: true,
		description: 'Reference to the personnel who created this plan',
	})
	personnel: Personnel;

	@Prop({
		type: ObjectId,
		ref: 'Patient',
		description: 'Patient ID (MongoDB ObjectId) associated with this plan',
	})
	patient: Patient;

	@Prop({
		type: ObjectId,
		ref: 'PlannerSession',
		required: true,
		description: 'Reference to the planner session this plan belongs to',
	})
	plannerSession: PlannerSession;

	@Prop({ description: 'Primary objective of the chronic care treatment plan' })
	treatmentGoal: string;

	@Prop({
		description:
			'List of medications prescribed or recommended for the patient',
	})
	medications: string;

	@Prop({
		description:
			'Dietary, exercise, or habit changes recommended for the patient',
	})
	lifestyleAdvice: string;

	@Prop({
		description: 'Supplementary treatments or therapies for the patient',
	})
	otherTherapies: string;

	@Prop({
		description: 'Required follow-up measurements or checks for the patient',
	})
	monitoring: string;

	@Prop({ description: 'Date and time of the next scheduled appointment' })
	nextAppointmentAt: Date;

	@Prop({
		type: String,
		description: 'The state of the plan. Default is draft',
		default: PlanStatus.DRAFT,
		enum: PlanStatus,
	})
	status: PlanStatus;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);

PlanSchema.post<Plan>('save', async function (doc) {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=${doc.personnel}*chronic-care*doctors*planner*${doc.patient}*plans*`,
	);
});

PlanSchema.post('insertMany', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*doctors*planner*plans*`,
	);
});

PlanSchema.post<Plan>('findOneAndUpdate', async function (doc: Plan | null) {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=${doc ? doc.personnel : ''}*chronic-care*doctors*planner${doc ? `*${doc.patient}*` : '*'}plans*`,
	);
});

PlanSchema.post<Plan>('findOneAndDelete', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*doctors*planner*${this.patient}*plans*`,
	);
});

PlanSchema.post<Plan>('deleteMany', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*doctors*planner*plans*`,
	);
});
