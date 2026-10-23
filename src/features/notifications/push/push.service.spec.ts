import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import { Model, Types } from 'mongoose';
import { UserType } from '@/core/auth/enums';
import { UserToken } from '../entities/user-tokens.entity';
import { PushService } from './push.service';

describe('PushService FCM tokens', () => {
	let service: PushService;
	let userTokenModel: Mocked<Model<UserToken>>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(PushService).compile();
		service = unit;
		userTokenModel = unitRef.get(getModelToken(UserToken.name));
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('moves a device token to the user registering it', async () => {
		await service.addFcmToken({ fcmToken: 'device-1' } as any, {
			sub: 'user-b',
			aud: UserType.DH_CLIENTS,
		});

		expect(userTokenModel.updateOne).toHaveBeenCalledWith(
			{ fcmToken: 'device-1' },
			{
				$set: expect.objectContaining({
					fcmToken: 'device-1',
					userId: 'user-b',
					userType: UserType.DH_CLIENTS,
				}),
			},
			{ upsert: true },
		);
	});

	it("only removes the caller's own row, reporting whether one existed", async () => {
		userTokenModel.deleteOne.mockResolvedValueOnce({ deletedCount: 1 } as any);
		await expect(
			service.removeFcmToken({ fcmToken: 'device-1' } as any, 'user-a'),
		).resolves.toBe(true);
		expect(userTokenModel.deleteOne).toHaveBeenCalledWith({
			userId: 'user-a',
			fcmToken: 'device-1',
		});

		userTokenModel.deleteOne.mockResolvedValueOnce({ deletedCount: 0 } as any);
		await expect(
			service.removeFcmToken({ fcmToken: 'unknown' } as any, 'user-a'),
		).resolves.toBe(false);
	});

	it('keeps only the newest owner of a token shared by several users', async () => {
		const [newest, older, oldest] = [1, 2, 3].map(() => new Types.ObjectId());
		userTokenModel.aggregate.mockResolvedValue([
			{ _id: 'device-1', ids: [newest, older, oldest] },
		] as any);

		await service.onModuleInit();

		expect(userTokenModel.deleteMany).toHaveBeenCalledWith({
			_id: { $in: [older, oldest] },
		});
		expect(userTokenModel.createIndexes).toHaveBeenCalled();
	});

	it('never fails startup when de-duplication errors', async () => {
		userTokenModel.aggregate.mockRejectedValue(new Error('db down'));
		await expect(service.onModuleInit()).resolves.toBeUndefined();
	});
});
