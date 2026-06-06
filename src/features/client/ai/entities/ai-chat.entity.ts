import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseEntity } from '@/common/entities';
import { deleteByPattern } from '@/core/caching/utils';
import type { ChatTypes } from '../../dto';

export enum AIMessageRole {
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
export class ClientAIChat extends BaseEntity {
	@Prop({ description: 'User ID associated with this chat message' })
	userId: string;

	@Prop({
		type: String,
		enum: AIMessageRole,
		description: 'Role of the message sender (user, assistant, or system)',
	})
	role: AIMessageRole;

	@Prop({ description: 'Content of the chat message' })
	content: string;

	@Prop({ description: 'Type of chat (e.g., text, audio)' })
	type: ChatTypes;

	@Prop({ description: 'Local chat ID for client-side tracking' })
	localChatId: string;

	@Prop({ description: 'Source of the message' })
	from: string;
}

export const ClientAiChatSchema = SchemaFactory.createForClass(ClientAIChat);

ClientAiChatSchema.post<ClientAIChat>('save', async function (doc) {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=${doc.userId}*client-ai*chats*`,
	);
});

ClientAiChatSchema.post('insertMany', async function () {
	await deleteByPattern(process.env.REDIS_URL!, `token=*client-ai*chats*`);
});

ClientAiChatSchema.post<ClientAIChat>(
	'findOneAndUpdate',
	async function (doc: ClientAIChat | null) {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=${doc ? doc.userId : ''}*client-ai*chats*`,
		);
	},
);

ClientAiChatSchema.post<ClientAIChat>('findOneAndDelete', async function () {
	await deleteByPattern(process.env.REDIS_URL!, `token=*client-ai*chats*`);
});

ClientAiChatSchema.post<ClientAIChat>('deleteMany', async function () {
	await deleteByPattern(process.env.REDIS_URL!, `token=*client-ai*chats*`);
});
