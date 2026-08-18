import { type Mocked, TestBed } from '@suites/unit';
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

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(UssdService).compile();

		service = unit;
		patientsService = unitRef.get(PatientsService);
		vitalHistoriesService = unitRef.get(VitalHistoriesService);
		cacheService = unitRef.get(CacheService);
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

		it('Step 4: should parse custom AM/PM datetime input and save reading', async () => {
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
				'1*120/80*2*18-08-26 02:30 PM',
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
	});
});
