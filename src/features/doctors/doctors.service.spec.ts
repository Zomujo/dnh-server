import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import { Model, Types } from 'mongoose';
import { VitalHistoriesService } from '../vital-histories/vital-histories.service';
import { DoctorsService } from './doctors.service';
import { Personnel } from './entities/personnel.entity';

describe('DoctorsService', () => {
	let service: DoctorsService;
	let personnelModel: Mocked<Model<Personnel>>;
	let vitalHistoriesService: Mocked<VitalHistoriesService>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(DoctorsService).compile();

		service = unit;
		personnelModel = unitRef.get(getModelToken(Personnel.name));
		vitalHistoriesService = unitRef.get(VitalHistoriesService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('fetchAnalytics', () => {
		it('should call vitalHistoriesService.fetchAnalytics with date filters', async () => {
			vitalHistoriesService.fetchAnalytics.mockResolvedValue({
				patientsCount: 10,
				vitalsRecordedCount: 25,
			});

			const query = { dateRange: 'TODAY' as const };
			const result = await service.fetchAnalytics(query, 'personnel-1');

			expect(vitalHistoriesService.fetchAnalytics).toHaveBeenCalledWith({
				personnelId: 'personnel-1',
				timestamp: expect.any(Object),
			});
			expect(result).toEqual({
				patientsCount: 10,
				vitalsRecordedCount: 25,
			});
		});
	});

	describe('findPersonnelById', () => {
		it('should find personnel document by ObjectId', async () => {
			const mockId = new Types.ObjectId();
			const mockQueryChain = {
				select: vi
					.fn()
					.mockResolvedValue({ _id: mockId, userName: 'Dr. John' }),
			};
			personnelModel.findById.mockReturnValue(mockQueryChain as any);

			const result = await service.findPersonnelById(
				mockId.toString(),
				'userName',
			);

			expect(personnelModel.findById).toHaveBeenCalledWith(mockId);
			expect(result).toEqual({ _id: mockId, userName: 'Dr. John' });
		});
	});

	describe('fetchReferralCode', () => {
		it('should return referral code for personnel', async () => {
			const mockQueryChain = {
				select: vi.fn().mockResolvedValue({ referralCode: 'REF-1234' }),
			};
			personnelModel.findById.mockReturnValue(mockQueryChain as any);

			const code = await service.fetchReferralCode('personnel-1');

			expect(personnelModel.findById).toHaveBeenCalledWith('personnel-1');
			expect(code).toBe('REF-1234');
		});

		it('should throw NotFoundException if personnel does not exist', async () => {
			const mockQueryChain = {
				select: vi.fn().mockResolvedValue(null),
			};
			personnelModel.findById.mockReturnValue(mockQueryChain as any);

			await expect(service.fetchReferralCode('invalid-id')).rejects.toThrow(
				NotFoundException,
			);
		});
	});
});
