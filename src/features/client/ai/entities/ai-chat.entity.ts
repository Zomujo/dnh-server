import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseEntity } from '@/common/entities';
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

	@Prop({ type: String, description: 'Type of chat (e.g., text, audio)' })
	type: ChatTypes;

	@Prop({ description: 'Local chat ID for client-side tracking' })
	localChatId: string;

	@Prop({ description: 'Source of the message' })
	from: string;

	@Prop({
		description:
			'For assistant replies: id of the user message this answers. Lets a resend with the same localChatId return the original reply.',
	})
	replyTo: string;
}

export const ClientAiChatSchema = SchemaFactory.createForClass(ClientAIChat);

// History reads (newest first per user) and the resend lookups by
// localChatId / replyTo.
ClientAiChatSchema.index({ userId: 1, createdAt: -1 });
ClientAiChatSchema.index(
	{ userId: 1, localChatId: 1 },
	{ partialFilterExpression: { localChatId: { $type: 'string' } } },
);
ClientAiChatSchema.index(
	{ userId: 1, replyTo: 1 },
	{ partialFilterExpression: { replyTo: { $type: 'string' } } },
);
