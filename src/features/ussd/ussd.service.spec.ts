import { type Mocked, TestBed } from '@suites/unit';
import { Types } from 'mongoose';
import { AuditService } from '@/core/audit/audit.service';
import {
	AuditAction,
	AuditActorKind,
	AuditOutcome,
} from '@/core/audit/entities/audit-log.entity';
import { CacheService } from '@/core/caching/caching.service';
import { VitalTypes } from '@/features/vital-histories/dto/vital-history.dto';
import { VitalHistoriesService } from '@/features/vital-histories/vital-histories.service';
import { PatientsService } from '../patients/patients.service';
import { UssdService } from './ussd.service';

describe('UssdService', () => {
	let service: UssdService;
	let patientsService: Mocked<PatientsService>;
	let vitalHistoriesService: Mocked<VitalHistoriesService>;
	let cacheService: Mocked<CacheService<any>>;
	let auditService: Mocked<AuditService>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(UssdService).compile();

		service = unit;
		patientsService = unitRef.get(PatientsService);
		vitalHistoriesService = unitRef.get(VitalHistoriesService);
		cacheService = unitRef.get(CacheService);
		auditService = unitRef.get(AuditService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('handleSession', () => {
		it('Step 0: should return main menu when text is empty', async () => {
			const res = await service.handleSession('sess-1', '+233201234567', '');

			expect(res).toContain('CON Welcome to Yelima Health.');
			expect(res).toContain('1. Blood Pressure');
		});

		it('Step 1: should return reading prompt and cache vitalType', async () => {
			const res = await service.handleSession('sess-1', '+233201234567', '1');

			expect(cacheService.set).toHaveBeenCalledWith(
				'ussd:session:sess-1',
				{ vitalType: VitalTypes.BLOOD_PRESSURE },
				expect.any(Number),
			);
			expect(res).toContain('CON Enter your Blood Pressure reading:');
		});

		it('Step 2: should store value and ask timing prompt', async () => {
			cacheService.get.mockResolvedValue({
				vitalType: VitalTypes.BLOOD_PRESSURE,
			});

			const res = await service.handleSession(
				'sess-1',
				'+233201234567',
				'1*120/80',
			);

			expect(cacheService.set).toHaveBeenCalledWith(
				'ussd:session:sess-1',
				{ vitalType: VitalTypes.BLOOD_PRESSURE, value: '120/80' },
				expect.any(Number),
			);
			expect(res).toContain('CON Blood Pressure: 120/80');
			expect(res).toContain('1. Just now');
		});

		it('Step 3a: should save reading immediately when timing is 1 (Just now)', async () => {
			const recordedAt = new Date();
			cacheService.get.mockResolvedValue({
				vitalType: VitalTypes.BLOOD_PRESSURE,
				value: '120/80',
				recordedAt,
			});

			patientsService.findPatientByPhoneNumber.mockResolvedValue({
				_id: { toString: () => 'p-1' },
				userId: 'u-1',
			} as any);

			vitalHistoriesService.loadVitalHistory.mockResolvedValue({} as any);

			const res = await service.handleSession(
				'sess-1',
				'+233201234567',
				'1*120/80*1',
			);

			expect(vitalHistoriesService.loadVitalHistory).toHaveBeenCalledWith(
				expect.objectContaining({
					vitalType: VitalTypes.BLOOD_PRESSURE,
					value: '120/80',
					patient: 'p-1',
				}),
				'u-1',
			);
			expect(res).toContain('END Reading logged successfully.');
		});

		it('Step 3b: should prompt for custom date/time when timing is 2', async () => {
			const res = await service.handleSession(
				'sess-1',
				'+233201234567',
				'1*120/80*2',
			);

			expect(res).toContain('CON Enter date & time of reading:');
			expect(res).toContain('Format: DD-MM-YY HH:MM AM|PM');
		});

		it('Step 4: should parse custom mixed-case AM/PM datetime input and save reading', async () => {
			const recordedAt = new Date('2024-01-01T14:30:00.000Z');
			cacheService.get.mockResolvedValue({
				vitalType: VitalTypes.BLOOD_PRESSURE,
				value: '120/80',
				recordedAt,
			});

			patientsService.findPatientByPhoneNumber.mockResolvedValue({
				_id: { toString: () => 'p-1' },
				userId: 'u-1',
			} as any);

			vitalHistoriesService.loadVitalHistory.mockResolvedValue({} as any);

			const res = await service.handleSession(
				'sess-1',
				'+233201234567',
				'1*120/80*2*01-01-24 02:30 pM',
			);

			expect(vitalHistoriesService.loadVitalHistory).toHaveBeenCalledWith(
				expect.objectContaining({
					vitalType: VitalTypes.BLOOD_PRESSURE,
					value: '120/80',
					patient: 'p-1',
				}),
				'u-1',
			);
			expect(res).toContain('END Reading logged successfully.');
		});

		it('Step 4: should reject datetime input that is in the future', async () => {
			const res = await service.handleSession(
				'sess-1',
				'+233201234567',
				'1*120/80*2*18-08-99 02:30 PM',
			);

			expect(res).toContain(
				'END Invalid format. Please dial again and use DD-MM-YY HH:MM AM|PM',
			);
			expect(vitalHistoriesService.loadVitalHistory).not.toHaveBeenCalled();
		});
	});

	describe('audit trail', () => {
		const phone = '+233201234567';
		const requestInfo = {
			headers: { 'user-agent': 'AfricasTalking' },
			ip: '196.201.214.1',
		};

		beforeEach(() => {
			cacheService.get.mockResolvedValue({
				vitalType: VitalTypes.BLOOD_SUGAR,
				value: '5.6',
				recordedAt: new Date(),
			});
			patientsService.findPatientByPhoneNumber.mockResolvedValue({
				_id: { toString: () => 'p-1' },
				userId: 'hcp-0193',
			} as any);
		});

		it('records a saved reading against the patient and the new vital', async () => {
			const vitalId = new Types.ObjectId();
			vitalHistoriesService.loadVitalHistory.mockResolvedValue(vitalId);

			await service.handleSession('sess-1', phone, '2*5.6*1', requestInfo);

			expect(auditService.record).toHaveBeenCalledTimes(1);
			expect(auditService.record).toHaveBeenCalledWith(
				expect.objectContaining({
					action: AuditAction.CREATE,
					outcome: AuditOutcome.SUCCESS,
					method: 'POST',
					route: '/api/v1/ussd',
					resourceType: 'vital-histories',
					resourceId: vitalId.toHexString(),
					patientId: 'p-1',
					ip: '196.201.214.1',
					userAgent: 'AfricasTalking',
					actor: {
						kind: AuditActorKind.PATIENT,
						userType: 'ussd',
						userId: 'hcp-0193',
						patientId: 'p-1',
					},
				}),
			);
		});

		it('records a failed save', async () => {
			vitalHistoriesService.loadVitalHistory.mockRejectedValue(
				new Error('db down'),
			);

			const res = await service.handleSession(
				'sess-1',
				phone,
				'2*5.6*1',
				requestInfo,
			);

			expect(res).toContain('END Could not save your reading.');
			expect(auditService.record).toHaveBeenCalledWith(
				expect.objectContaining({
					action: AuditAction.CREATE,
					outcome: AuditOutcome.FAILURE,
					patientId: 'p-1',
					resourceId: undefined,
				}),
			);
		});

		it('records an unknown number as refused, without the number', async () => {
			patientsService.findPatientByPhoneNumber.mockResolvedValue(null);

			await service.handleSession('sess-1', phone, '2*5.6*1', requestInfo);

			expect(vitalHistoriesService.loadVitalHistory).not.toHaveBeenCalled();
			const entry = auditService.record.mock.calls[0][0];
			expect(entry).toMatchObject({
				action: AuditAction.ACCESS_DENIED,
				outcome: AuditOutcome.FAILURE,
				actor: { kind: AuditActorKind.ANONYMOUS, userType: 'ussd' },
			});
			expect(JSON.stringify(entry)).not.toContain('201234567');
		});

		it('does not audit menu steps', async () => {
			await service.handleSession('sess-1', phone, '', requestInfo);
			await service.handleSession('sess-1', phone, '2', requestInfo);
			await service.handleSession('sess-1', phone, '2*5.6', requestInfo);

			expect(auditService.record).not.toHaveBeenCalled();
		});
	});
});
