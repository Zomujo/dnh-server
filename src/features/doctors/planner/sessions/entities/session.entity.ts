import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities';
import { deleteByPattern } from '@/core/caching/utils';
import { Personnel } from '@/features/doctors/entities/personnel.entity';
import { Patient } from '@/features/patients/entities/patient.entity';

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
export class PlannerSession extends BaseEntity {
	@Prop({
		index: true,
		type: ObjectId,
		ref: 'Patient',
		required: true,
		description: 'Reference to the patient for this session',
	})
	patient: string | Patient;

	@Prop({ description: 'Name or title of the planner session' })
	name: string;

	@Prop({
		type: ObjectId,
		ref: 'Personnel',
		required: true,
		description: 'Reference to the personnel who owns this session',
	})
	personnel: Personnel;
}

export const PlannerSessionSchema =
	SchemaFactory.createForClass(PlannerSession);

PlannerSessionSchema.post<PlannerSession>('save', async function (doc) {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=${doc.personnel}*chronic-care*doctors*planner*${doc.patient}*sessions*`,
	);
});

PlannerSessionSchema.post<PlannerSession>(
	'findOneAndUpdate',
	async function (doc: PlannerSession | null) {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=${doc ? doc.personnel : ''}*chronic-care*doctors*planner${doc ? `*${doc.patient}*` : '*'}sessions*`,
		);
	},
);

PlannerSessionSchema.post<PlannerSession>(
	'findOneAndDelete',
	async function () {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=*chronic-care*doctors*planner*sessions*`,
		);
	},
);

PlannerSessionSchema.post<PlannerSession>('deleteMany', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*doctors*planner*sessions*`,
	);
});
