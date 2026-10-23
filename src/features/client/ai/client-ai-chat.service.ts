import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FirebaseService } from '@/core/firebase/firebase.service';
import { AIMessageRole, ClientAIChat } from './entities/ai-chat.entity';

@Injectable()
export class ClientAIChatService {
	private readonly logger = new Logger(ClientAIChatService.name);

	constructor(
		@InjectModel(ClientAIChat.name)
		private readonly clientAIChatModel: Model<ClientAIChat>,
		private readonly firebaseService: FirebaseService,
	) {}

	async countChatsForPatient(userId: string) {
		return this.clientAIChatModel.countDocuments({ userId });
	}

	async findByLocalChatId(userId: string, localChatId: string) {
		return this.clientAIChatModel.findOne({ userId, localChatId });
	}

	async findNextAssistantMessage(userId: string, afterDate: Date) {
		return this.clientAIChatModel
			.findOne({
				userId,
				role: AIMessageRole.ASSISTANT,
				from: 'audio',
				createdAt: { $gt: afterDate },
			})
			.sort({ createdAt: 1 });
	}

	async deleteById(id: string, userId: string) {
		return this.clientAIChatModel.findOneAndDelete({ _id: id, userId });
	}

	async findLastAssistantMessage(userId: string) {
		return this.clientAIChatModel
			.findOne({ userId, role: AIMessageRole.ASSISTANT })
			.sort({ createdAt: -1 })
			.select('content');
	}

	async findByUserId(userId: string, offset: number, limit: number) {
		const messages = await this.clientAIChatModel
			.find({ userId })
			.sort({ createdAt: -1 })
			.limit(limit)
			.skip(offset)
			.select('-userId');

		return messages;
	}

	async countByUserId(userId: string): Promise<number> {
		return this.clientAIChatModel.countDocuments({ userId });
	}

	async findOneAndDelete(conditions: Record<string, any>) {
		const message = await this.clientAIChatModel.findOneAndDelete(conditions);

		if (!message) {
			throw new NotFoundException('Chat message not found');
		}

		if (message.type === 'audio') {
			// The chat row is already gone; a missing or legacy-format file must
			// not turn a successful delete into an error for the client.
			await this.firebaseService
				.deleteFile(message.content)
				.catch((error) =>
					this.logger.warn(
						`Voice note file not deleted for chat ${message.id}: ${error?.message}`,
					),
				);
		}
	}

	async removeByUserId(userId: string) {
		return this.clientAIChatModel.deleteMany({ userId });
	}
}
