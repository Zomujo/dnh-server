import { type Mocked, TestBed } from '@suites/unit';
import { DoctorsService } from '../doctors/doctors.service';
import { VitalHistoriesService } from '../vital-histories/vital-histories.service';
import { PharmaciesService } from './pharmacies.service';

describe('PharmaciesService', () => {
	let service: PharmaciesService;
	let vitalHistoriesService: Mocked<VitalHistoriesService>;
	let doctorsService: Mocked<DoctorsService>;

	beforeAll(async () => {
		const { unit, unitRef } =
			await TestBed.solitary(PharmaciesService).compile();

		service = unit;
		vitalHistoriesService = unitRef.get(VitalHistoriesService);
		doctorsService = unitRef.get(DoctorsService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('fetchAnalytics', () => {
		it('should query analytics from vitalHistoriesService', async () => {
			vitalHistoriesService.fetchAnalytics.mockResolvedValue({
				patientsCount: 15,
				vitalsRecordedCount: 40,
			});

			const result = await service.fetchAnalytics(
				{ dateRange: 'TODAY' as const },
				'personnel-1',
			);

			expect(vitalHistoriesService.fetchAnalytics).toHaveBeenCalledWith({
				personnelId: 'personnel-1',
				timestamp: expect.any(Object),
			});
			expect(result).toEqual({
				patientsCount: 15,
				vitalsRecordedCount: 40,
			});
		});
	});

	describe('fetchReferralCode', () => {
		it('should delegate referral code lookup to doctorsService', async () => {
			doctorsService.fetchReferralCode.mockResolvedValue('REF-PHARM-99');

			const code = await service.fetchReferralCode('personnel-1');

			expect(doctorsService.fetchReferralCode).toHaveBeenCalledWith(
				'personnel-1',
			);
			expect(code).toBe('REF-PHARM-99');
		});
	});
});
