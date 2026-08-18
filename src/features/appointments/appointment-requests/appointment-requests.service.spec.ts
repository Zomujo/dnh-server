import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import { Model, Types } from 'mongoose';
import { AppointmentRequestsService } from './appointment-requests.service';
import { AppointmentRequest } from './entities/appointment-request.entity';

describe('AppointmentRequestsService', () => {
	let service: AppointmentRequestsService;
	let model: Mocked<Model<AppointmentRequest>>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(
			AppointmentRequestsService,
		).compile();

		service = unit;
		model = unitRef.get(getModelToken(AppointmentRequest.name));
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('create', () => {
		it('should create an appointment request document', async () => {
			const dto = {
				reason: 'Routine Checkup',
				preferredDate: new Date('2026-09-01'),
				patient: new Types.ObjectId(),
				host: new Types.ObjectId(),
			};
			const mockCreatedRequest = {
				_id: 'req-789',
				...dto,
			};
			model.create.mockResolvedValue(mockCreatedRequest as any);

			const result = await service.create(dto as any);

			expect(model.create).toHaveBeenCalledWith(dto);
			expect(result).toEqual(mockCreatedRequest);
		});
	});

	describe('findAll', () => {
		it('should return paginated appointment requests and count without patientId', async () => {
			const mockRequests = [{ _id: 'req-1', reason: 'Checkup' }];
			const query = { page: 1, pageSize: 10 };

			const mockQueryChain = {
				skip: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				sort: vi.fn().mockResolvedValue(mockRequests),
			};
			model.find.mockReturnValue(mockQueryChain as any);
			model.countDocuments.mockResolvedValue(1);

			const result = await service.findAll(query as any);

			expect(model.find).toHaveBeenCalledWith({});
			expect(result).toEqual({
				rows: mockRequests,
				count: 1,
			});
		});

		it('should filter by patientId when provided', async () => {
			const mockRequests = [{ _id: 'req-1', reason: 'Checkup' }];
			const query = { page: 1, pageSize: 10 };
			const patientId = new Types.ObjectId().toString();

			const mockQueryChain = {
				skip: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				sort: vi.fn().mockResolvedValue(mockRequests),
			};
			model.find.mockReturnValue(mockQueryChain as any);
			model.countDocuments.mockResolvedValue(1);

			const result = await service.findAll(query as any, patientId);

			expect(model.find).toHaveBeenCalledWith({
				patient: new Types.ObjectId(patientId),
			});
			expect(result).toEqual({
				rows: mockRequests,
				count: 1,
			});
		});
	});

	describe('findAllForFacility', () => {
		it('should filter by host facilityId and patientId', async () => {
			const mockRequests = [{ _id: 'req-1' }];
			const query = { page: 1, pageSize: 10 };
			const facilityId = new Types.ObjectId().toString();
			const patientId = new Types.ObjectId().toString();

			const mockQueryChain = {
				skip: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				sort: vi.fn().mockResolvedValue(mockRequests),
			};
			model.find.mockReturnValue(mockQueryChain as any);
			model.countDocuments.mockResolvedValue(1);

			const result = await service.findAllForFacility(
				facilityId,
				patientId,
				query as any,
			);

			expect(model.find).toHaveBeenCalledWith({
				host: new Types.ObjectId(facilityId),
				patient: new Types.ObjectId(patientId),
			});
			expect(result).toEqual({
				rows: mockRequests,
				count: 1,
			});
		});
	});

	describe('findOne', () => {
		it('should find appointment request by ID', async () => {
			const mockRequest = { _id: 'req-1', reason: 'Checkup' };
			model.findById.mockResolvedValue(mockRequest as any);

			const result = await service.findOne('req-1');

			expect(model.findById).toHaveBeenCalledWith('req-1');
			expect(result).toEqual(mockRequest);
		});
	});

	describe('update', () => {
		it('should update appointment request by ID', async () => {
			const mockUpdated = { _id: 'req-1', reason: 'Updated Checkup' };
			model.findByIdAndUpdate.mockResolvedValue(mockUpdated as any);

			const dto = { reason: 'Updated Checkup' };
			const result = await service.update('req-1', dto as any);

			expect(model.findByIdAndUpdate).toHaveBeenCalledWith('req-1', dto, {
				new: true,
			});
			expect(result).toEqual(mockUpdated);
		});
	});

	describe('remove', () => {
		it('should delete appointment request by ID', async () => {
			const mockDeleted = { _id: 'req-1' };
			model.findByIdAndDelete.mockResolvedValue(mockDeleted as any);

			const result = await service.remove('req-1');

			expect(model.findByIdAndDelete).toHaveBeenCalledWith('req-1');
			expect(result).toEqual(mockDeleted);
		});
	});

	describe('removeByPatientId', () => {
		it('should delete all appointment requests matching patientId', async () => {
			model.deleteMany.mockResolvedValue({ deletedCount: 2 } as any);

			const result = await service.removeByPatientId('patient-123');

			expect(model.deleteMany).toHaveBeenCalledWith({
				patient: 'patient-123',
			});
			expect(result).toEqual({ deletedCount: 2 });
		});
	});
});
