import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import type { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { PushService } from '@/features/notifications/push/push.service';
import { PatientsService } from '@/features/patients/patients.service';
import { AppointmentsService } from './appointments.service';
import { AppointmentStatus } from './dto';
import { Appointment } from './entities/appointment.entity';

describe('AppointmentsService', () => {
	let service: AppointmentsService;
	let appointmentModel: Mocked<Model<Appointment>>;
	let patientsService: Mocked<PatientsService>;
	let pushService: Mocked<PushService>;
	let reminderQueue: Mocked<Queue>;

	beforeAll(async () => {
		const { unit, unitRef } =
			await TestBed.solitary(AppointmentsService).compile();

		service = unit;
		appointmentModel = unitRef.get(getModelToken(Appointment.name));
		patientsService = unitRef.get(PatientsService);
		pushService = unitRef.get(PushService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		reminderQueue = (service as any).reminderQueue;
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('create', () => {
		it('should create an appointment and schedule a reminder when appointmentDate is in future', async () => {
			const futureDate = new Date(Date.now() + 1000 * 60 * 60);
			const patientId = new Types.ObjectId().toString();
			const mockPatient = { _id: patientId, userId: 'user-789' };

			patientsService.findPatientById.mockResolvedValue(mockPatient as any);

			const mockCreatedAppointment = {
				_id: new Types.ObjectId('664b7f8e2c2a1e4b8f1d2c3a'),
				title: 'Checkup',
				appointmentDate: futureDate,
				status: AppointmentStatus.SCHEDULED,
			};
			appointmentModel.create.mockResolvedValue(mockCreatedAppointment as any);

			const dto = {
				title: 'Checkup',
				patient: patientId,
				appointmentDate: futureDate,
			};

			const result = await service.create(dto as any);

			expect(patientsService.findPatientById).toHaveBeenCalledWith(patientId);
			expect(appointmentModel.create).toHaveBeenCalledWith({
				title: 'Checkup',
				appointmentDate: futureDate,
				status: AppointmentStatus.SCHEDULED,
				patient: new Types.ObjectId(patientId),
				userId: 'user-789',
			});
			expect(reminderQueue.add).toHaveBeenCalled();
			expect(result).toEqual(mockCreatedAppointment);
		});

		it('should throw NotFoundException if patient does not exist', async () => {
			patientsService.findPatientById.mockResolvedValue(null);

			await expect(
				service.create({
					title: 'Checkup',
					patient: 'nonexistent-id',
				} as any),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('createPatientAppointment', () => {
		it('should create patient appointment with personnel & host facility', async () => {
			const futureDate = new Date(Date.now() + 1000 * 3600);
			const patientId = new Types.ObjectId().toString();
			const personnelId = new Types.ObjectId().toString();
			const facilityId = new Types.ObjectId().toString();

			patientsService.findPatientById.mockResolvedValue({
				_id: patientId,
				userId: 'user-1',
			} as any);

			const mockAppointmentId = new Types.ObjectId();
			appointmentModel.create.mockResolvedValue({
				_id: mockAppointmentId,
				appointmentDate: futureDate,
			} as any);

			const dto = {
				title: 'Follow-up',
				appointmentDate: futureDate,
			};

			const result = await service.createPatientAppointment(
				dto as any,
				patientId,
				personnelId,
				facilityId,
			);

			expect(appointmentModel.create).toHaveBeenCalledWith({
				...dto,
				status: AppointmentStatus.SCHEDULED,
				hostPersonnel: new Types.ObjectId(personnelId),
				userId: 'user-1',
				patient: new Types.ObjectId(patientId),
				host: new Types.ObjectId(facilityId),
			});
			expect(result).toEqual(mockAppointmentId);
		});
	});

	describe('findAll', () => {
		it('should find appointments matching filter and pagination', async () => {
			const mockAppointments = [{ title: 'Checkup' }];
			const mockQueryChain = {
				skip: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				sort: vi.fn().mockResolvedValue(mockAppointments),
			};

			appointmentModel.find.mockReturnValue(mockQueryChain as any);
			appointmentModel.countDocuments.mockResolvedValue(1);

			const result = await service.findAll(
				{ page: 1, pageSize: 10 } as any,
				'user-1',
			);

			expect(appointmentModel.find).toHaveBeenCalledWith({
				userId: 'user-1',
			});
			expect(result).toEqual({ rows: mockAppointments, count: 1 });
		});
	});

	describe('cancelAppointment', () => {
		it('should cancel appointment when requested by owner personnel', async () => {
			const personnelId = new Types.ObjectId().toString();
			const mockAppointment = {
				_id: 'app-1',
				title: 'Checkup',
				hostPersonnel: personnelId,
				status: AppointmentStatus.SCHEDULED,
				userId: 'user-123',
				save: vi.fn().mockResolvedValue(true),
			};

			appointmentModel.findById.mockResolvedValue(mockAppointment as any);
			reminderQueue.getJob.mockResolvedValue({
				remove: vi.fn().mockResolvedValue(true),
			} as any);

			const dto = { reason: 'Conflict' };
			const result = await service.cancelAppointment(
				'app-1',
				personnelId,
				dto as any,
			);

			expect(mockAppointment.status).toBe(AppointmentStatus.CANCELLED);
			expect(mockAppointment.save).toHaveBeenCalled();
			expect(pushService.sendNotification).toHaveBeenCalled();
			expect(result).toBe('app-1');
		});

		it('should throw ForbiddenException if cancelled by non-owner personnel', async () => {
			const mockAppointment = {
				_id: 'app-1',
				hostPersonnel: 'owner-personnel-id',
				status: AppointmentStatus.SCHEDULED,
			};

			appointmentModel.findById.mockResolvedValue(mockAppointment as any);

			await expect(
				service.cancelAppointment('app-1', 'different-personnel-id', {
					reason: 'Test',
				} as any),
			).rejects.toThrow(ForbiddenException);
		});

		it('should throw BadRequestException if appointment is already completed', async () => {
			const personnelId = new Types.ObjectId().toString();
			const mockAppointment = {
				_id: 'app-1',
				hostPersonnel: personnelId,
				status: AppointmentStatus.COMPLETED,
			};

			appointmentModel.findById.mockResolvedValue(mockAppointment as any);

			await expect(
				service.cancelAppointment('app-1', personnelId, {
					reason: 'Test',
				} as any),
			).rejects.toThrow(BadRequestException);
		});
	});

	describe('rescheduleAppointment', () => {
		it('should reschedule scheduled appointment', async () => {
			const personnelId = new Types.ObjectId().toString();
			const newDate = new Date(Date.now() + 1000 * 7200);

			const mockAppointment = {
				_id: 'app-1',
				hostPersonnel: personnelId,
				status: AppointmentStatus.SCHEDULED,
				rescheduledCount: 0,
				save: vi.fn().mockResolvedValue(true),
			};

			appointmentModel.findById.mockResolvedValue(mockAppointment as any);
			reminderQueue.getJob.mockResolvedValue(null as any);

			const dto = {
				reason: 'Doctor unavailable',
				appointmentDate: newDate,
			};
			const result = await service.rescheduleAppointment(
				'app-1',
				personnelId,
				dto as any,
			);

			expect(mockAppointment.status).toBe(AppointmentStatus.RESCHEDULED);
			expect(mockAppointment.rescheduledCount).toBe(1);
			expect(mockAppointment.save).toHaveBeenCalled();
			expect(result).toBe('app-1');
		});
	});

	describe('completeAppointment', () => {
		it('should complete appointment when requested by owner personnel', async () => {
			const personnelId = new Types.ObjectId().toString();
			const mockAppointment = {
				_id: 'app-1',
				hostPersonnel: personnelId,
				status: AppointmentStatus.SCHEDULED,
				save: vi.fn().mockResolvedValue(true),
			};

			appointmentModel.findById.mockResolvedValue(mockAppointment as any);
			reminderQueue.getJob.mockResolvedValue(null as any);

			const result = await service.completeAppointment('app-1', personnelId);

			expect(mockAppointment.status).toBe(AppointmentStatus.COMPLETED);
			expect(mockAppointment.save).toHaveBeenCalled();
			expect(result).toBe('app-1');
		});
	});

	describe('removeByPatientId', () => {
		it('should delete all appointments for a patientId', async () => {
			appointmentModel.deleteMany.mockResolvedValue({
				deletedCount: 3,
			} as any);

			const result = await service.removeByPatientId('patient-123');

			expect(appointmentModel.deleteMany).toHaveBeenCalledWith({
				patient: 'patient-123',
			});
			expect(result).toEqual({ deletedCount: 3 });
		});
	});
});
