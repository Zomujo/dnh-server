import { type Mocked, TestBed } from '@suites/unit';
import { Types } from 'mongoose';
import { AdherencesService } from '@/features/adherences/adherences.service';
import { FacilitiesService } from '@/features/facilities/facilities.service';
import { MedicationSection } from '@/features/medications/dto';
import { MedicationsService } from '@/features/medications/medications.service';
import { ClientService } from './client.service';

describe('ClientService', () => {
	let service: ClientService;
	let medicationsService: Mocked<MedicationsService>;
	let adherencesService: Mocked<AdherencesService>;
	let facilitiesService: Mocked<FacilitiesService>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(ClientService).compile();

		service = unit;
		medicationsService = unitRef.get(MedicationsService);
		adherencesService = unitRef.get(AdherencesService);
		facilitiesService = unitRef.get(FacilitiesService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('fetchMedications', () => {
		it('should delegate to medicationsService.findByUserId', async () => {
			medicationsService.findByUserId.mockResolvedValue([
				{ name: 'Metformin' },
			] as any);
			medicationsService.countByUserId.mockResolvedValue(1);

			const result = await service.fetchMedications(
				{ page: 1, pageSize: 10 } as any,
				'user-1',
			);

			expect(medicationsService.findByUserId).toHaveBeenCalledWith(
				'user-1',
				0,
				10,
			);
			expect(result).toEqual({
				medications: [{ name: 'Metformin' }],
				count: 1,
			});
		});
	});

	describe('fetchFacilities', () => {
		it('should delegate to facilitiesService.findAll', async () => {
			facilitiesService.findAll.mockResolvedValue({
				rows: [{ name: 'Korle Bu' }],
				count: 1,
			} as any);

			const result = await service.fetchFacilities({
				page: 1,
				pageSize: 10,
			} as any);

			expect(facilitiesService.findAll).toHaveBeenCalledWith({
				page: 1,
				pageSize: 10,
			});
			expect(result).toEqual({ rows: [{ name: 'Korle Bu' }], count: 1 });
		});
	});

	describe('confirmMedication', () => {
		it('should confirm dose completion via adherencesService.upsertAdherenceLog', async () => {
			const validMedId = new Types.ObjectId().toString();
			const pastTime = new Date();
			pastTime.setHours(pastTime.getHours() - 1);

			medicationsService.findById.mockResolvedValue({
				_id: validMedId,
				patient: new Types.ObjectId().toString(),
				frequency: { repeatEvery: 1, repetitionType: 'daily' },
				startDate: new Date(),
				morning: {
					time: {
						hour: pastTime.getHours(),
						minutes: 0,
						timeDesignators: 'AM',
					},
				},
			} as any);

			adherencesService.upsertAdherenceLog.mockResolvedValue('log-123' as any);

			const result = await service.confirmMedication(
				validMedId,
				'user-1',
				MedicationSection.MORNING,
			);

			expect(adherencesService.upsertAdherenceLog).toHaveBeenCalled();
			expect(result).toBeDefined();
		});
	});
});
