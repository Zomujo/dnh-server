import { type Mocked, TestBed } from '@suites/unit';
import { PushService } from '@/features/notifications/push/push.service';
import { PatientsService } from '@/features/patients/patients.service';
import { VigilSentinelService } from './vigil-sentinel.service';

describe('VigilSentinelService', () => {
	let service: VigilSentinelService;
	let patientsService: Mocked<PatientsService>;
	let pushService: Mocked<PushService>;

	beforeAll(async () => {
		const { unit, unitRef } =
			await TestBed.solitary(VigilSentinelService).compile();

		service = unit;
		patientsService = unitRef.get(PatientsService);
		pushService = unitRef.get(PushService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	it('should send notification to topic when patient has a facility', async () => {
		const patientMock = {
			_id: 'patient-1',
			name: 'Jane Doe',
			facility: 'fac-789',
		};
		patientsService.findPatientById.mockResolvedValue(patientMock as any);

		await service.alertFacility({
			patientId: 'patient-1',
			summary: 'Severe hypertension detected',
		});

		expect(patientsService.findPatientById).toHaveBeenCalledWith(
			'patient-1',
			'facility name',
		);
		expect(pushService.sendNotificationToTopic).toHaveBeenCalledWith(
			expect.any(Function),
			'fac-789',
		);

		// Execute payload builder callback passed to sendNotificationToTopic to verify body & structure
		const payloadFn = pushService.sendNotificationToTopic.mock
			.calls[0][0] as () => any;
		const generatedPayload = payloadFn();

		expect(generatedPayload).toEqual({
			notification: {
				title: 'Patient Safety Alert',
				body: 'Jane Doe: Severe hypertension detected',
			},
			data: {
				notification_type: 'notification',
				click_action: 'FLUTTER_NOTIFICATION_CLICK',
			},
		});
	});

	it('should fallback patient name to "A patient" if name is missing', async () => {
		const patientMock = {
			_id: 'patient-1',
			facility: 'fac-789',
		};
		patientsService.findPatientById.mockResolvedValue(patientMock as any);

		await service.alertFacility({
			patientId: 'patient-1',
			summary: 'Severe condition',
		});

		const payloadFn = pushService.sendNotificationToTopic.mock
			.calls[0][0] as () => any;
		const generatedPayload = payloadFn();

		expect(generatedPayload.notification.body).toBe(
			'A patient: Severe condition',
		);
	});

	it('should log warning and not send notification if patient has no facility', async () => {
		const patientMock = {
			_id: 'patient-1',
			name: 'Jane Doe',
			facility: null,
		};
		patientsService.findPatientById.mockResolvedValue(patientMock as any);

		await service.alertFacility({
			patientId: 'patient-1',
			summary: 'Alert text',
		});

		expect(pushService.sendNotificationToTopic).not.toHaveBeenCalled();
	});

	it('should log warning and not send notification if patient is not found', async () => {
		patientsService.findPatientById.mockResolvedValue(null as any);

		await service.alertFacility({
			patientId: 'nonexistent-id',
			summary: 'Alert text',
		});

		expect(pushService.sendNotificationToTopic).not.toHaveBeenCalled();
	});

	it('should catch error gracefully if patientsService throws exception', async () => {
		patientsService.findPatientById.mockRejectedValue(
			new Error('Database error'),
		);

		await expect(
			service.alertFacility({
				patientId: 'patient-1',
				summary: 'Alert text',
			}),
		).resolves.not.toThrow();

		expect(pushService.sendNotificationToTopic).not.toHaveBeenCalled();
	});
});
