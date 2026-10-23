import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { generateFilter } from '@/common/factory';
import { FirebaseService } from '@/core/firebase/firebase.service';
import { Personnel } from '@/features/doctors/entities/personnel.entity';
import { PushService } from '@/features/notifications/push/push.service';
import { Patient } from '@/features/patients/entities/patient.entity';
import { ChatPaginationQueryDto } from './dto';
import { ChatMessage, MessageType } from './entities/message.entity';
import { ChatRoom } from './entities/room.entity';

@Injectable()
export class ChatService {
	private logger = new Logger(ChatService.name);

	constructor(
		@InjectModel(ChatRoom.name) private roomModel: Model<ChatRoom>,
		@InjectModel(ChatMessage.name) private messageModel: Model<ChatMessage>,
		@InjectModel(Personnel.name) private personnelModel: Model<Personnel>,
		@InjectModel(Patient.name) private patientModel: Model<Patient>,
		private readonly pushService: PushService,
		private readonly firebaseService: FirebaseService,
	) {}

	private static readonly MEDIA_TYPES: ReadonlySet<string> = new Set([
		MessageType.IMAGE,
		MessageType.VIDEO,
		MessageType.AUDIO,
	]);

	private async signContent<T extends Record<string, any>>(message: T) {
		if (
			!ChatService.MEDIA_TYPES.has(message.messageType) ||
			message.deletedForEveryone
		) {
			return message;
		}
		// content can be sender-supplied (sendMessage accepts a media
		// messageType), so only sign objects stored under this message's own
		// room. Otherwise a participant could post another room's object URL
		// and read back a working signed link to it.
		const objectPath = this.firebaseService.objectPathFromUrl(message.content);
		if (!objectPath?.startsWith(`hcp_chats/${String(message.roomId)}/`)) {
			return message;
		}
		return {
			...message,
			content: await this.firebaseService.signedUrlFor(message.content),
		};
	}

	/**
	 * Plain copy of a message with media content (and a populated media
	 * parent) swapped for short-lived signed URLs. Stored media URLs carry
	 * no access token, so this is the only way clients can read them.
	 */
	async withSignedMedia(message: any) {
		const plain =
			typeof message?.toJSON === 'function' ? message.toJSON() : message;
		const signed = await this.signContent(plain);
		const parent = signed.parentMessageId;
		if (parent && typeof parent === 'object' && 'content' in parent) {
			return { ...signed, parentMessageId: await this.signContent(parent) };
		}
		return signed;
	}

	async getOrCreateRoom(userA: string, userB: string) {
		let room = await this.roomModel.findOne({
			participants: { $all: [userA, userB], $size: 2 },
		});

		if (!room) {
			room = await this.roomModel.create({
				participants: [userA, userB],
			});
		}

		return room;
	}

	/**
	 * Throws 404 unless `userId` is one of the room's participants. A room the
	 * caller isn't in is reported exactly like a nonexistent one, so room ids
	 * can't be probed.
	 */
	async assertParticipant(roomId: string, userId: string | undefined) {
		if (!userId || !isValidObjectId(roomId)) {
			throw new NotFoundException('Room not found');
		}
		const isParticipant = await this.roomModel.exists({
			_id: roomId,
			participants: userId,
		});
		if (!isParticipant) {
			throw new NotFoundException('Room not found');
		}
	}

	async saveMessage(
		senderId: string,
		roomId: string,
		content: string,
		messageType: MessageType,
		parentMessageId?: string,
	) {
		const payload: Record<string, any> = {
			senderId,
			roomId,
			content,
			messageType,
			isRead: false,
		};

		if (parentMessageId) {
			payload.parentMessageId = new Types.ObjectId(parentMessageId);
		}

		const message = await this.messageModel.create(payload);

		if (parentMessageId) {
			return message.populate({
				path: 'parentMessageId',
				select: 'content senderId messageType',
			});
		}

		return message;
	}

	async markAsRead(roomId: string, userId: string) {
		await this.messageModel.updateMany(
			{ roomId, senderId: { $ne: userId }, isRead: false },
			{ $set: { isRead: true } },
		);
	}

	async editMessage(messageId: string, userId: string, content: string) {
		const message = await this.messageModel.findById(messageId);
		if (!message) {
			throw new NotFoundException('Message not found');
		}
		if (message.senderId !== userId) {
			throw new Error('You can only edit your own messages');
		}
		if (message.messageType !== MessageType.TEXT) {
			throw new Error('Only text messages can be edited');
		}
		message.content = content;
		message.edited = true;
		await message.save();
		return message;
	}

	async deleteMessage(
		messageId: string,
		userId: string,
		deleteFor: 'me' | 'everyone',
	) {
		const message = await this.messageModel.findById(messageId);
		if (!message) {
			throw new NotFoundException('Message not found');
		}

		if (deleteFor === 'everyone') {
			if (message.senderId !== userId) {
				throw new Error('You can only delete your own messages for everyone');
			}
			message.deletedForEveryone = true;
			await message.save();
			return { deletedForEveryone: true, message };
		}

		await this.messageModel.updateOne(
			{ _id: messageId },
			{ $addToSet: { deletedFor: userId } },
		);
		return { deletedForEveryone: false };
	}

	async getPaginatedMessages(
		roomId: string,
		userId: string,
		query: ChatPaginationQueryDto,
	) {
		await this.assertParticipant(roomId, userId);
		const { pageFilter } = generateFilter(query);
		// Messages the caller deleted "for me" are hidden from their history.
		const filter = { roomId, deletedFor: { $ne: userId } };

		const messages = await this.messageModel
			.find(filter)
			.sort({ createdAt: -1 })
			.skip(pageFilter.offset)
			.limit(pageFilter.limit)
			.populate({
				path: 'parentMessageId',
				select: 'content senderId messageType',
			})
			.lean();

		const plainRows = messages.map((msg: any) => {
			const row: any = {
				id: msg._id?.toString(),
				...msg,
				_id: undefined,
				__v: undefined,
			};
			if (row.deletedForEveryone) {
				row.content = 'This message was deleted';
			}
			return row;
		});
		const rows = await Promise.all(
			plainRows.map((row) => this.withSignedMedia(row)),
		);

		const count = await this.messageModel.countDocuments(filter);

		return { rows, count };
	}

	// Awaited via emitAsync by account deletion; errors must reach it so the
	// deletion fails (and can be retried) instead of silently leaving data.
	@OnEvent('patient.purge.chat', { suppressErrors: false })
	private async handlePurgePatient(payload: { userId: string }) {
		return this.removeByUserId(payload.userId);
	}

	/**
	 * Deletes every room the user is in, with all of its messages (both
	 * sides) and stored media. Rooms go last, so a partial failure can be
	 * retried: the room ids are still there to find what's left.
	 */
	async removeByUserId(userId: string) {
		const rooms = await this.roomModel
			.find({ participants: userId })
			.select('_id')
			.lean();
		const roomIds = rooms.map((room) => room._id.toString());

		await Promise.all(
			roomIds.map((roomId) =>
				this.firebaseService.deleteFolder(`hcp_chats/${roomId}`),
			),
		);
		const messages = await this.messageModel.deleteMany({
			$or: [{ roomId: { $in: roomIds } }, { senderId: userId }],
		});
		const deletedRooms = await this.roomModel.deleteMany({
			_id: { $in: roomIds },
		});

		return {
			chatRooms: deletedRooms.deletedCount,
			chatMessages: messages.deletedCount,
		};
	}

	async findRoomById(roomId: string) {
		const room = await this.roomModel.findById(roomId);
		if (!room) {
			throw new NotFoundException('Room not found');
		}
		return room;
	}

	async sendPushNotificationForMessage(data: {
		senderId: string;
		senderRole: 'patient' | 'hcp';
		roomId: string;
		content: string;
		messageType: string;
	}) {
		try {
			const room = await this.findRoomById(data.roomId);
			const recipientId = room.participants.find((id) => id !== data.senderId);
			if (!recipientId) return;

			let senderName: string;
			if (data.senderRole === 'hcp') {
				const personnel = await this.personnelModel
					.findById(data.senderId)
					.select('userName')
					.lean();
				senderName = personnel?.userName ?? 'Clinician';
			} else {
				const patient = await this.patientModel
					.findOne({ userId: data.senderId })
					.select('name')
					.lean();
				senderName = patient?.name ?? 'Patient';
			}

			const body =
				data.messageType === 'audio'
					? '🎤 Voice message'
					: data.messageType === 'image'
						? '📷 Photo'
						: data.messageType === 'video'
							? '🎬 Video'
							: data.content;

			await this.pushService.sendAugurNotification({
				userId: recipientId,
				title: senderName,
				body,
				chatId: data.roomId,
				payload: { notification_type: 'chat' },
			});
		} catch (error) {
			this.logger.error('Failed to send push notification', error);
		}
	}

	async listUserSessions(
		userId: string,
		userRole: 'patient' | 'hcp',
		query: ChatPaginationQueryDto,
	): Promise<{
		rows: {
			id: string;
			unread: boolean;
			otherParticipant: { id: string; name: string; role: string };
			latestMessage: {
				id: string;
				content: string;
				messageType: string;
				senderId: string;
				createdAt: Date;
			} | null;
		}[];
		count: number;
	}> {
		const { pageFilter } = generateFilter(query);

		const rooms = await this.roomModel
			.find({ participants: userId })
			.sort({ updatedAt: -1 })
			.skip(pageFilter.offset)
			.limit(pageFilter.limit)
			.lean();

		const count = await this.roomModel.countDocuments({ participants: userId });

		const sessions = await Promise.all(
			rooms.map(async (room) => {
				const otherId = room.participants.find((id) => id !== userId)!;

				let name: string;
				let otherRole: string;

				if (userRole === 'patient') {
					const personnel = await this.personnelModel
						.findById(otherId)
						.select('userName')
						.lean();
					name = personnel?.userName ?? 'Unknown';
					otherRole = 'hcp';
				} else {
					const patient = await this.patientModel
						.findOne({ userId: otherId })
						.select('name')
						.lean();
					name = patient?.name ?? 'Unknown';
					otherRole = 'patient';
				}

				const latestMessage = await this.messageModel
					.findOne({
						roomId: room._id.toString(),
						deletedForEveryone: { $ne: true },
					})
					.sort({ _id: -1 })
					.select('content messageType senderId createdAt isRead')
					.lean();

				const isUnread =
					!!latestMessage &&
					latestMessage.senderId !== userId &&
					!latestMessage.isRead;

				const plainId = (room as any)._id?.toString();

				return {
					id: plainId,
					unread: isUnread,
					otherParticipant: {
						id: otherId,
						name,
						role: otherRole,
					},
					latestMessage: latestMessage
						? {
								id: (latestMessage as any)._id?.toString(),
								content: (await this.signContent(latestMessage)).content,
								messageType: latestMessage.messageType,
								senderId: latestMessage.senderId,
								createdAt: latestMessage.createdAt,
							}
						: null,
				};
			}),
		);

		return { rows: sessions, count };
	}
}
