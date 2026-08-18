import { NotFoundException } from '@nestjs/common';
import { type Mocked, TestBed } from '@suites/unit';
import { AdherencesService } from '@/features/adherences/adherences.service';
import { AppointmentRequestsService } from '@/features/appointments/appointment-requests/appointment-requests.service';
import { AppointmentsService } from '@/features/appointments/appointments.service';
import { ConcernsService } from '@/features/concerns/concerns.service';
import { MedicationsService } from '@/features/medications/medications.service';
import { PushService } from '@/features/notifications/push/push.service';
import { PatientsService } from '@/features/patients/patients.service';
import { VitalHistoriesService } from '@/features/vital-histories/vital-histories.service';
import { HcpService } from './hcp.service';

describe('HcpService', () => {
	let service: HcpService;
	let patientsService: Mocked<PatientsService>;
	let medicationsService: Mocked<MedicationsService>;
	let adherencesService: Mocked<AdherencesService>;
	let vitalHistoriesService: Mocked<VitalHistoriesService>;
	let appointmentsService: Mocked<AppointmentsService>;
	let appointmentRequestsService: Mocked<AppointmentRequestsService>;
	let concernsService: Mocked<ConcernsService>;
	let pushService: Mocked<PushService>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(HcpService).compile();

		service = unit;
		patientsService = unitRef.get(PatientsService);
		medicationsService = unitRef.get(MedicationsService);
		adherencesService = unitRef.get(AdherencesService);
		vitalHistoriesService = unitRef.get(VitalHistoriesService);
		appointmentsService = unitRef.get(AppointmentsService);
		appointmentRequestsService = unitRef.get(AppointmentRequestsService);
		concernsService = unitRef.get(ConcernsService);
		pushService = unitRef.get(PushService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('findAllPatients', () => {
		it('should delegate to patientsService.findAll', async () => {
			patientsService.findAll.mockResolvedValue({
				rows: [{ name: 'John Doe' }],
				count: 1,
			} as any);

			const result = await service.findAllPatients({
				page: 1,
				pageSize: 10,
			} as any);

			expect(patientsService.findAll).toHaveBeenCalledWith({
				page: 1,
				pageSize: 10,
			});
			expect(result).toEqual({ rows: [{ name: 'John Doe' }], count: 1 });
		});
	});

	describe('findAllVitalHistories', () => {
		it('should delegate to vitalHistoriesService.findAll', async () => {
			vitalHistoriesService.findAll.mockResolvedValue({
				rows: [{ vitalType: 'bloodPressure' }],
				count: 1,
			} as any);

			const result = await service.findAllVitalHistories({
				page: 1,
				pageSize: 10,
			} as any);

			expect(vitalHistoriesService.findAll).toHaveBeenCalledWith({
				page: 1,
				pageSize: 10,
			});
			expect(result).toEqual({
				rows: [{ vitalType: 'bloodPressure' }],
				count: 1,
			});
		});
	});

	describe('createPatientAppointment', () => {
		it('should create appointment and dispatch push notification to patient', async () => {
			patientsService.findPatientById.mockResolvedValue({
				userId: 'user-123',
			} as any);
			appointmentsService.createPatientAppointment.mockResolvedValue(
				'appt-1' as any,
			);

			const dto = {
				title: 'Cardio Follow-up',
				description: 'Regular checkup',
				appointmentDate: '2026-09-01T10:00:00Z',
			};

			const result = await service.createPatientAppointment(
				'patient-1',
				'personnel-1',
				'facility-1',
				dto as any,
			);

			expect(patientsService.findPatientById).toHaveBeenCalledWith(
				'patient-1',
				'userId',
			);
			expect(appointmentsService.createPatientAppointment).toHaveBeenCalledWith(
				dto,
				'patient-1',
				'personnel-1',
				'facility-1',
			);
			expect(pushService.sendNotification).toHaveBeenCalled();
			expect(result).toBe('appt-1');
		});

		it('should throw NotFoundException if patient does not exist', async () => {
			patientsService.findPatientById.mockResolvedValue(null);

			await expect(
				service.createPatientAppointment(
					'invalid-id',
					'personnel-1',
					'facility-1',
					{} as any,
				),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('findPatientAppointmentRequests', () => {
		it('should delegate to appointmentRequestsService.findAllForFacility', async () => {
			patientsService.findPatientById.mockResolvedValue({
				_id: 'patient-1',
			} as any);
			appointmentRequestsService.findAllForFacility.mockResolvedValue([
				{ type: 'Checkup' },
			] as any);

			const result = await service.findPatientAppointmentRequests(
				'patient-1',
				'facility-1',
				{ page: 1, pageSize: 10 } as any,
			);

			expect(
				appointmentRequestsService.findAllForFacility,
			).toHaveBeenCalledWith('facility-1', 'patient-1', {
				page: 1,
				pageSize: 10,
			});
			expect(result).toEqual([{ type: 'Checkup' }]);
		});
	});

	describe('findPatientSymptoms', () => {
		it('should delegate to concernsService.findAllSymptomsForFacility', async () => {
			patientsService.findPatientById.mockResolvedValue({
				_id: 'patient-1',
			} as any);
			concernsService.findAllSymptomsForFacility.mockResolvedValue({
				rows: [{ description: 'Fever' }],
				count: 1,
			} as any);

			const result = await service.findPatientSymptoms(
				'patient-1',
				'facility-1',
				{ page: 1, pageSize: 10 } as any,
			);

			expect(concernsService.findAllSymptomsForFacility).toHaveBeenCalledWith(
				'facility-1',
				'patient-1',
				{
					page: 1,
					pageSize: 10,
				},
			);
			expect(result).toEqual({ rows: [{ description: 'Fever' }], count: 1 });
		});
	});

	describe('findPatientMedications', () => {
		it('should delegate to medicationsService.findByUserId', async () => {
			patientsService.findPatientById.mockResolvedValue({
				userId: 'user-123',
			} as any);
			medicationsService.findByUserId.mockResolvedValue([
				{ name: 'Metformin' },
			] as any);
			medicationsService.countByUserId.mockResolvedValue(1);

			const result = await service.findPatientMedications('patient-1', {
				page: 1,
				pageSize: 10,
			} as any);

			expect(medicationsService.findByUserId).toHaveBeenCalledWith(
				'user-123',
				0,
				10,
			);
			expect(result).toEqual({
				medications: [{ name: 'Metformin' }],
				count: 1,
			});
		});
	});

	describe('findPatientMedicationAdherenceLogs', () => {
		it('should compute monthly adherence logs and adherenceRate', async () => {
			patientsService.findPatientById.mockResolvedValue({
				userId: 'user-123',
			} as any);
			medicationsService.findById.mockResolvedValue({
				name: 'Lisinopril',
			} as any);
			adherencesService.findAdherenceLogsByTarget.mockResolvedValue([
				{ id: 'log-1', takenAt: new Date('2026-06-01'), taken: true },
			] as any);

			const result = await service.findPatientMedicationAdherenceLogs(
				'patient-1',
				'med-1',
				{ date: '2026-06-15' } as any,
			);

			expect(result.medicationName).toBe('Lisinopril');
			expect(result.logs.length).toBe(30); // June has 30 days
			expect(result.adherenceRate).toBeGreaterThanOrEqual(0);
		});
	});

	describe('findOnePatient', () => {
		it('should return patient object with facility details and critical vitals count', async () => {
			const mockPatient = {
				toObject: () => ({
					_id: 'patient-1',
					userId: 'user-123',
					facility: { _id: 'fac-1', name: 'General Hospital' },
				}),
			};
			patientsService.findOne.mockResolvedValue(mockPatient as any);
			vitalHistoriesService.countVitalsBySeverity.mockResolvedValue(2);

			const result = await service.findOnePatient('patient-1');

			expect(patientsService.findOne).toHaveBeenCalledWith('patient-1');
			expect(vitalHistoriesService.countVitalsBySeverity).toHaveBeenCalled();
			expect(result).toEqual(
				expect.objectContaining({
					_id: 'patient-1',
					facility: { id: 'fac-1', name: 'General Hospital' },
					criticalReadingsCount: 2,
					assignedToYou: false,
				}),
			);
		});
	});
});
