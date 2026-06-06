import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities';
import { deleteByPattern } from '@/core/caching/utils';
import type { ChatTypes } from '@/features/client/dto';
import { Patient } from '@/features/patients/entities/patient.entity';
import { Personnel } from '../../entities/personnel.entity';
import { PlannerSession } from '../sessions/entities/session.entity';
export enum PlannerMessageRole {
	USER = 'user',
	ASSISTANT = 'assistant',
	SYSTEM = 'system',
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
export class PlannerChat extends BaseEntity {
	@Prop({
		type: ObjectId,
		ref: 'Personnel',
		required: true,
		description: 'Reference to the personnel who sent/received this message',
	})
	personnel: Personnel;

	@Prop({
		type: ObjectId,
		ref: 'PlannerSession',
		required: true,
		description: 'Reference to the planner session this chat belongs to',
	})
	plannerSession: PlannerSession;

	@Prop({
		type: ObjectId,
		ref: 'Patient',
		description:
			'Patient ID (MongoDB ObjectId) associated with this planner session',
	})
	patient: Patient;

	@Prop({
		type: String,
		enum: PlannerMessageRole,
		description: 'Role of the message sender (user, assistant, or system)',
	})
	role: PlannerMessageRole;

	@Prop({ description: 'Content of the chat message' })
	content: string;

	@Prop({ description: 'Type of chat (e.g., text, audio)' })
	type: ChatTypes;

	@Prop({ description: 'Source of the message' })
	from: string;
}

export const PlannerChatSchema = SchemaFactory.createForClass(PlannerChat);

PlannerChatSchema.post<PlannerChat>('save', async function (doc) {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=${doc.personnel}*chronic-care*doctors*planner*${doc.patient}*sessions*${doc.plannerSession}*chats*`,
	);
});

PlannerChatSchema.post('insertMany', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*doctors*planner*sessions*chats*`,
	);
});

PlannerChatSchema.post<PlannerChat>(
	'findOneAndUpdate',
	async function (doc: PlannerChat | null) {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=${doc ? doc.personnel : ''}*chronic-care*doctors*planner${doc ? `*${doc.patient}*` : '*'}sessions${doc ? `*${doc.plannerSession}*` : '*'}chats*`,
		);
	},
);

PlannerChatSchema.post<PlannerChat>('findOneAndDelete', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*doctors*planner*${this.patient}*sessions*${this.plannerSession}*chats*`,
	);
});

PlannerChatSchema.post<PlannerChat>('deleteMany', async function () {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=*chronic-care*doctors*planner*sessions*chats*`,
	);
});
