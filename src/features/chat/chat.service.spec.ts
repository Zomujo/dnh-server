import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import { Model } from 'mongoose';
import { Personnel } from '@/features/doctors/entities/personnel.entity';
import { PushService } from '@/features/notifications/push/push.service';
import { Patient } from '@/features/patients/entities/patient.entity';
import { ChatService } from './chat.service';
import { ChatMessage, MessageType } from './entities/message.entity';
import { ChatRoom } from './entities/room.entity';

describe('ChatService', () => {
	let service: ChatService;
	let roomModel: Mocked<Model<ChatRoom>>;
	let messageModel: Mocked<Model<ChatMessage>>;
	let personnelModel: Mocked<Model<Personnel>>;
	let _patientModel: Mocked<Model<Patient>>;
	let pushService: Mocked<PushService>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(ChatService).compile();

		service = unit;
		roomModel = unitRef.get(getModelToken(ChatRoom.name));
		messageModel = unitRef.get(getModelToken(ChatMessage.name));
		personnelModel = unitRef.get(getModelToken(Personnel.name));
		_patientModel = unitRef.get(getModelToken(Patient.name));
		pushService = unitRef.get(PushService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('getOrCreateRoom', () => {
		it('should return existing room when participants match', async () => {
			const mockRoom = { _id: 'room-1', participants: ['userA', 'userB'] };
			roomModel.findOne.mockResolvedValue(mockRoom as any);

			const room = await service.getOrCreateRoom('userA', 'userB');

			expect(roomModel.findOne).toHaveBeenCalledWith({
				participants: { $all: ['userA', 'userB'], $size: 2 },
			});
			expect(room).toEqual(mockRoom);
		});

		it('should create new room when no existing room is found', async () => {
			const mockRoom = { _id: 'room-2', participants: ['userA', 'userB'] };
			roomModel.findOne.mockResolvedValue(null);
			roomModel.create.mockResolvedValue(mockRoom as any);

			const room = await service.getOrCreateRoom('userA', 'userB');

			expect(roomModel.create).toHaveBeenCalledWith({
				participants: ['userA', 'userB'],
			});
			expect(room).toEqual(mockRoom);
		});
	});

	describe('saveMessage', () => {
		it('should create message record', async () => {
			const mockMsg = {
				_id: 'msg-1',
				senderId: 'userA',
				roomId: 'room-1',
				content: 'Hello',
				messageType: MessageType.TEXT,
			};
			messageModel.create.mockResolvedValue(mockMsg as any);

			const msg = await service.saveMessage(
				'userA',
				'room-1',
				'Hello',
				MessageType.TEXT,
			);

			expect(messageModel.create).toHaveBeenCalledWith({
				senderId: 'userA',
				roomId: 'room-1',
				content: 'Hello',
				messageType: MessageType.TEXT,
				isRead: false,
			});
			expect(msg).toEqual(mockMsg);
		});
	});

	describe('markAsRead', () => {
		it('should update unread messages from other senders to read', async () => {
			messageModel.updateMany.mockResolvedValue({ modifiedCount: 3 } as any);

			await service.markAsRead('room-1', 'userA');

			expect(messageModel.updateMany).toHaveBeenCalledWith(
				{ roomId: 'room-1', senderId: { $ne: 'userA' }, isRead: false },
				{ $set: { isRead: true } },
			);
		});
	});

	describe('editMessage', () => {
		it('should edit own text message', async () => {
			const mockMsg = {
				senderId: 'userA',
				messageType: MessageType.TEXT,
				content: 'Old content',
				edited: false,
				save: vi.fn().mockResolvedValue(true),
			};

			messageModel.findById.mockResolvedValue(mockMsg as any);

			const updated = await service.editMessage(
				'msg-1',
				'userA',
				'New content',
			);

			expect(mockMsg.content).toBe('New content');
			expect(mockMsg.edited).toBe(true);
			expect(mockMsg.save).toHaveBeenCalled();
			expect(updated).toEqual(mockMsg);
		});

		it('should throw error when editing someone else message', async () => {
			const mockMsg = { senderId: 'userB' };
			messageModel.findById.mockResolvedValue(mockMsg as any);

			await expect(
				service.editMessage('msg-1', 'userA', 'Hack'),
			).rejects.toThrow('You can only edit your own messages');
		});
	});

	describe('sendPushNotificationForMessage', () => {
		it('should resolve recipient and send push notification', async () => {
			const mockRoom = { _id: 'room-1', participants: ['userA', 'userB'] };
			roomModel.findById.mockResolvedValue(mockRoom as any);

			personnelModel.findById.mockReturnValue({
				select: vi.fn().mockReturnThis(),
				lean: vi.fn().mockResolvedValue({ userName: 'Dr. Smith' }),
			} as any);

			pushService.sendAugurNotification.mockResolvedValue({} as any);

			await service.sendPushNotificationForMessage({
				senderId: 'userA',
				senderRole: 'hcp',
				roomId: 'room-1',
				content: 'Your test results are back',
				messageType: 'text',
			});

			expect(pushService.sendAugurNotification).toHaveBeenCalledWith({
				userId: 'userB',
				title: 'Dr. Smith',
				body: 'Your test results are back',
				chatId: 'room-1',
				payload: { notification_type: 'chat' },
			});
		});
	});

	describe('removeByUserId', () => {
		it('should remove user rooms and messages', async () => {
			roomModel.deleteMany.mockResolvedValue({ deletedCount: 1 } as any);
			messageModel.deleteMany.mockResolvedValue({ deletedCount: 5 } as any);

			await service.removeByUserId('userA');

			expect(roomModel.deleteMany).toHaveBeenCalledWith({
				participants: 'userA',
			});
			expect(messageModel.deleteMany).toHaveBeenCalledWith({
				senderId: 'userA',
			});
		});
	});
});
