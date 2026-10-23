import { Logger } from '@nestjs/common';
import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { resolveCorsOrigins } from '@/common/utils/helpers';
import { ChatService } from './chat.service';
import { MessageType } from './entities/message.entity';
import { WsAuthVerifier } from './ws-auth.verifier';

@WebSocketGateway({
	cors: { origin: resolveCorsOrigins() },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
	private logger = new Logger(ChatGateway.name);
	private userSockets = new Map<string, Set<string>>();
	private userStatus = new Map<string, { online: boolean; lastSeen: Date }>();

	@WebSocketServer()
	server: Server;

	constructor(
		private readonly chatService: ChatService,
		private readonly wsAuthVerifier: WsAuthVerifier,
	) {}

	async handleConnection(client: Socket) {
		try {
			const user = await this.wsAuthVerifier.verify(client);
			client.data.user = user;

			// Track connection
			if (!this.userSockets.has(user.id)) {
				this.userSockets.set(user.id, new Set());
			}
			this.userSockets.get(user.id)!.add(client.id);
			this.userStatus.set(user.id, { online: true, lastSeen: new Date() });

			client.emit('userConnected', {
				id: user.id,
				role: user.role,
				email: user.email,
			});
			this.logger.log(`Client connected: ${user.id} (${user.role})`);
		} catch (error) {
			this.logger.error('Connection rejected', error);
			client.emit('error', 'Authentication failed');
			client.disconnect(true);
		}
	}

	async handleDisconnect(client: Socket) {
		const userId = client.data.user?.id;
		if (!userId) return;

		const sockets = this.userSockets.get(userId);
		if (sockets) {
			sockets.delete(client.id);
			if (sockets.size === 0) {
				this.userSockets.delete(userId);
				const lastSeen = new Date();
				this.userStatus.set(userId, { online: false, lastSeen });
				// Notify rooms this user was in
				for (const roomId of client.rooms) {
					if (roomId !== client.id) {
						this.server.to(roomId).emit('userStatus', {
							userId,
							online: false,
							lastSeen: lastSeen.toISOString(),
						});
					}
				}
			}
		}
		this.logger.log(`Client disconnected: ${userId}`);
	}

	@SubscribeMessage('joinPrivateChat')
	async handleJoinPrivateChat(
		@ConnectedSocket() client: Socket,
		@MessageBody() payload: { recipientId: string },
	) {
		try {
			const userId = client.data.user.id;
			const room = await this.chatService.getOrCreateRoom(
				userId,
				payload.recipientId,
			);
			client.join(room.id);
			client.emit('roomJoined', { roomId: room.id });
			// Notify room about this user's status
			this.server.to(room.id).emit('userStatus', {
				userId,
				online: true,
				lastSeen: null,
			});
			// Send back the other participant's status
			const otherStatus = this.userStatus.get(payload.recipientId);
			if (otherStatus) {
				client.emit('userStatus', {
					userId: payload.recipientId,
					online: otherStatus.online,
					lastSeen: otherStatus.online
						? null
						: otherStatus.lastSeen.toISOString(),
				});
			}
		} catch (error) {
			this.logger.error('joinPrivateChat error', error);
			client.emit('error', 'Failed to join chat room');
		}
	}

	@SubscribeMessage('sendMessage')
	async handleSendMessage(
		@ConnectedSocket() client: Socket,
		@MessageBody()
		payload: {
			roomId: string;
			content: string;
			messageType?: MessageType;
			parentMessageId?: string;
		},
	) {
		try {
			const userId = client.data.user.id;
			await this.chatService.assertParticipant(payload.roomId, userId);
			const savedMsg = await this.chatService.saveMessage(
				userId,
				payload.roomId,
				payload.content,
				payload.messageType ?? MessageType.TEXT,
				payload.parentMessageId,
			);
			this.server.to(payload.roomId).emit('newMessage', savedMsg);

			this.chatService.sendPushNotificationForMessage({
				senderId: userId,
				senderRole: client.data.user.role,
				roomId: payload.roomId,
				content: payload.content,
				messageType: payload.messageType ?? MessageType.TEXT,
			});
		} catch (error) {
			this.logger.error('sendMessage error', error);
			client.emit('error', 'Failed to send message');
		}
	}

	@SubscribeMessage('editMessage')
	async handleEditMessage(
		@ConnectedSocket() client: Socket,
		@MessageBody()
		payload: { roomId: string; messageId: string; content: string },
	) {
		try {
			const userId = client.data.user.id;
			const updated = await this.chatService.editMessage(
				payload.messageId,
				userId,
				payload.content,
			);
			// Broadcast to the room the message actually lives in, not the
			// client-supplied roomId, so an edit can't be pushed elsewhere.
			this.server.to(updated.roomId).emit('messageEdited', {
				id: (updated as any)._id?.toString(),
				content: updated.content,
				edited: true,
			});
		} catch (error) {
			this.logger.error('editMessage error', error);
			client.emit('error', 'Failed to edit message');
		}
	}

	@SubscribeMessage('deleteMessage')
	async handleDeleteMessage(
		@ConnectedSocket() client: Socket,
		@MessageBody()
		payload: {
			roomId: string;
			messageId: string;
			deleteFor: 'me' | 'everyone';
		},
	) {
		try {
			const userId = client.data.user.id;
			const result = await this.chatService.deleteMessage(
				payload.messageId,
				userId,
				payload.deleteFor,
			);

			if (result.deletedForEveryone && result.message) {
				this.server.to(result.message.roomId).emit('messageDeleted', {
					id: (result.message as any)._id?.toString(),
					roomId: result.message.roomId,
					content: 'This message was deleted',
					deletedForEveryone: true,
					deletedBy: userId,
				});
			} else {
				client.emit('messageDeleted', {
					id: payload.messageId,
					roomId: payload.roomId,
					deletedForEveryone: false,
				});
			}
		} catch (error) {
			this.logger.error('deleteMessage error', error);
			client.emit('error', 'Failed to delete message');
		}
	}

	@SubscribeMessage('typing')
	handleTyping(
		@ConnectedSocket() client: Socket,
		@MessageBody() payload: { roomId: string; isTyping: boolean },
	) {
		// Only sockets that joined the room via joinPrivateChat (which is
		// participant-scoped) may signal into it.
		if (!client.rooms.has(payload.roomId)) return;
		const userId = client.data.user.id;
		client.to(payload.roomId).emit('userTyping', {
			userId,
			isTyping: payload.isTyping,
		});
	}

	@SubscribeMessage('audioRecording')
	handleAudioRecording(
		@ConnectedSocket() client: Socket,
		@MessageBody() payload: { roomId: string; isRecording: boolean },
	) {
		// Only sockets that joined the room via joinPrivateChat (which is
		// participant-scoped) may signal into it.
		if (!client.rooms.has(payload.roomId)) return;
		const userId = client.data.user.id;
		client.to(payload.roomId).emit('userAudioRecording', {
			userId,
			isRecording: payload.isRecording,
		});
	}

	@SubscribeMessage('markRead')
	async handleMarkRead(
		@ConnectedSocket() client: Socket,
		@MessageBody() payload: { roomId: string },
	) {
		try {
			const userId = client.data.user.id;
			await this.chatService.assertParticipant(payload.roomId, userId);
			await this.chatService.markAsRead(payload.roomId, userId);
			this.server
				.to(payload.roomId)
				.emit('messagesRead', { roomId: payload.roomId, readBy: userId });
		} catch (error) {
			this.logger.error('markRead error', error);
			client.emit('error', 'Failed to mark messages as read');
		}
	}
}
