import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import { Model, Types } from 'mongoose';
import { PatientsService } from '@/features/patients/patients.service';
import { PushService } from '../notifications/push/push.service';
import {
	VitalHistory,
	VitalSeverityEnum,
} from './entities/vital-history.entity';
import { VitalHistoriesService } from './vital-histories.service';

describe('VitalHistoriesService', () => {
	let service: VitalHistoriesService;
	let vitalHistoryModel: Mocked<Model<VitalHistory>>;
	let patientsService: Mocked<PatientsService>;
	let pushService: Mocked<PushService>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(
			VitalHistoriesService,
		).compile();

		service = unit;
		vitalHistoryModel = unitRef.get(getModelToken(VitalHistory.name));
		patientsService = unitRef.get(PatientsService);
		pushService = unitRef.get(PushService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('loadVitalHistory', () => {
		it('should load vital history, calculate severity, send push notification, and save record', async () => {
			const mockId = new Types.ObjectId();
			vitalHistoryModel.create.mockResolvedValue({ _id: mockId } as any);
			pushService.sendAugurNotification.mockResolvedValue({} as any);

			const dto = {
				vitalType: 'bloodPressure',
				value: '120/80',
				patient: new Types.ObjectId().toString(),
				recordedAt: new Date(),
			};

			const result = await service.loadVitalHistory(dto as any, 'user-1');

			expect(pushService.sendAugurNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user-1',
					title: 'Yelima',
				}),
			);
			expect(vitalHistoryModel.create).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user-1',
					vitalType: 'bloodPressure',
					value: '120/80',
					severity: VitalSeverityEnum.HYPERTENSIVE,
				}),
			);
			expect(result).toEqual(mockId);
		});

		it('should send topic notification to personnel when reading is critical and facilityId is provided', async () => {
			const mockId = new Types.ObjectId();
			vitalHistoryModel.create.mockResolvedValue({ _id: mockId } as any);
			pushService.sendAugurNotification.mockResolvedValue({} as any);
			pushService.sendNotificationToTopic.mockResolvedValue({} as any);

			const dto = {
				vitalType: 'bloodPressure',
				value: '190/130',
				patient: new Types.ObjectId().toString(),
				recordedAt: new Date(),
			};

			await service.loadVitalHistory(dto as any, 'user-1', 'facility-123');

			expect(pushService.sendNotificationToTopic).toHaveBeenCalledWith(
				expect.any(Function),
				'facility-123',
			);
		});
	});

	describe('create', () => {
		it('should create vital history cluster and update patient visited pharmacies', async () => {
			const patientId = new Types.ObjectId().toString();
			patientsService.findPatientById.mockResolvedValue({
				_id: patientId,
				userId: 'user-1',
			} as any);

			vitalHistoryModel.insertMany.mockResolvedValue([] as any);
			patientsService.updatePatientById.mockResolvedValue({} as any);

			const dto = {
				patient: patientId,
				recordedAt: new Date(),
				vitals: [{ vitalType: 'bloodPressure', value: '120/80' }],
			};

			const clusterId = await service.create(dto as any, 'personnel-1');

			expect(patientsService.findPatientById).toHaveBeenCalledWith(
				patientId,
				'userId',
			);
			expect(vitalHistoryModel.insertMany).toHaveBeenCalled();
			expect(patientsService.updatePatientById).toHaveBeenCalledWith(
				patientId,
				{
					$addToSet: { pharmaciesVisited: 'personnel-1' },
				},
			);
			expect(clusterId).toBeInstanceOf(Types.ObjectId);
		});

		it('should throw NotFoundException if patient does not exist', async () => {
			patientsService.findPatientById.mockResolvedValue(null);

			await expect(
				service.create(
					{ patient: 'invalid-id', vitals: [] } as any,
					'personnel-1',
				),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('findOne', () => {
		it('should find vital history cluster by clusterId', async () => {
			const clusterId = new Types.ObjectId().toString();
			const mockCluster = [{ id: clusterId, vitals: [] }];
			vitalHistoryModel.aggregate.mockResolvedValue(mockCluster as any);

			const result = await service.findOne(clusterId);

			expect(vitalHistoryModel.aggregate).toHaveBeenCalled();
			expect(result).toEqual(mockCluster[0]);
		});

		it('should throw NotFoundException if cluster is missing', async () => {
			vitalHistoryModel.aggregate.mockResolvedValue([]);

			await expect(
				service.findOne(new Types.ObjectId().toString()),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('update', () => {
		it('should update vital history cluster when updated by creator personnel', async () => {
			const clusterId = 'cluster-123';
			const mockVitals = [
				{
					clusterId,
					createdBy: 'personnel-1',
					userId: 'user-1',
					patient: 'patient-1',
					recordedAt: new Date(),
				},
			];

			vitalHistoryModel.find.mockReturnValue({
				lean: vi.fn().mockResolvedValue(mockVitals),
			} as any);

			vitalHistoryModel.updateOne.mockResolvedValue({} as any);
			vitalHistoryModel.updateMany.mockResolvedValue({} as any);

			const dto = {
				vitals: [{ vitalType: 'bloodPressure', value: '130/85' }],
			};

			const result = await service.update(clusterId, dto as any, 'personnel-1');

			expect(vitalHistoryModel.updateOne).toHaveBeenCalled();
			expect(result).toBe(clusterId);
		});

		it('should throw ForbiddenException if updated by non-creator personnel', async () => {
			const clusterId = 'cluster-123';
			const mockVitals = [{ clusterId, createdBy: 'owner-personnel' }];

			vitalHistoryModel.find.mockReturnValue({
				lean: vi.fn().mockResolvedValue(mockVitals),
			} as any);

			await expect(
				service.update(clusterId, { vitals: [] } as any, 'other-personnel'),
			).rejects.toThrow(ForbiddenException);
		});
	});

	describe('removeByUserId', () => {
		it('should delete all vital histories for a userId', async () => {
			vitalHistoryModel.deleteMany.mockResolvedValue({
				deletedCount: 6,
			} as any);

			const result = await service.removeByUserId('user-1');

			expect(vitalHistoryModel.deleteMany).toHaveBeenCalledWith({
				userId: 'user-1',
			});
			expect(result).toEqual({ deletedCount: 6 });
		});
	});

	describe('countVitalsBySeverity', () => {
		it('should return document count matching severity filter', async () => {
			vitalHistoryModel.countDocuments.mockResolvedValue(4);

			const count = await service.countVitalsBySeverity(
				'user-1',
				VitalSeverityEnum.HYPERTENSIVE_CRISIS,
			);

			expect(vitalHistoryModel.countDocuments).toHaveBeenCalledWith({
				userId: 'user-1',
				severity: VitalSeverityEnum.HYPERTENSIVE_CRISIS,
			});
			expect(count).toBe(4);
		});
	});
});
