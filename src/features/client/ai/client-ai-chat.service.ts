import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FirebaseService } from '@/core/firebase/firebase.service';
import { AIMessageRole, ClientAIChat } from './entities/ai-chat.entity';

@Injectable()
export class ClientAIChatService {
	constructor(
		@InjectModel(ClientAIChat.name)
		private readonly clientAIChatModel: Model<ClientAIChat>,
		private readonly firebaseService: FirebaseService,
	) {}

	async findByLocalChatId(localChatId: string) {
		return this.clientAIChatModel.findOne({ localChatId });
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

	async deleteById(id: string) {
		return this.clientAIChatModel.findByIdAndDelete(id);
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
			await this.firebaseService.deleteFile(message.content);
		}
	}

	async removeByUserId(userId: string) {
		return this.clientAIChatModel.deleteMany({ userId });
	}
}
