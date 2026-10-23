import { NotFoundException } from '@nestjs/common';
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

			medicationsService.findOwnedById.mockResolvedValue({
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

			expect(medicationsService.findOwnedById).toHaveBeenCalledWith(
				validMedId,
				'user-1',
			);
			expect(adherencesService.upsertAdherenceLog).toHaveBeenCalled();
			expect(result).toBeDefined();
		});

		describe('back-dated (scheduledFor)', () => {
			const medId = new Types.ObjectId().toString();
			const eightAm = { hour: 8, minutes: 0, timeDesignators: 'AM' };

			beforeEach(() => {
				vi.useFakeTimers();
				vi.setSystemTime(new Date(2026, 9, 23, 10, 0));
				medicationsService.findOwnedById.mockResolvedValue({
					_id: medId,
					name: 'Metformin',
					patient: new Types.ObjectId().toString(),
					frequency: { repeatEvery: 1, repetitionType: 'daily' },
					startDate: new Date(2026, 9, 1),
					morning: { time: eightAm },
				} as any);
				adherencesService.upsertAdherenceLog.mockResolvedValue('log-1' as any);
			});

			afterEach(() => {
				vi.useRealTimers();
			});

			it("confirms yesterday's dose at its own time, flagged PARTIAL past 4 h", async () => {
				const result = await service.confirmMedication(
					medId,
					'user-1',
					MedicationSection.MORNING,
					new Date(2026, 9, 22),
				);

				const yesterdayEight = new Date(2026, 9, 22, 8, 0);
				expect(result.scheduledFor).toEqual(yesterdayEight);
				expect(adherencesService.upsertAdherenceLog).toHaveBeenCalledWith(
					expect.objectContaining({ scheduledFor: yesterdayEight }),
					expect.objectContaining({
						scheduledFor: yesterdayEight,
						status: 'partial',
					}),
				);
			});

			it('rejects a dose more than 48 h old', async () => {
				await expect(
					service.confirmMedication(
						medId,
						'user-1',
						MedicationSection.MORNING,
						new Date(2026, 9, 21),
					),
				).rejects.toThrow(/48 hours/);
				expect(adherencesService.upsertAdherenceLog).not.toHaveBeenCalled();
			});

			it('rejects a dose 48 h 30 min old (no whole-hour rounding)', async () => {
				vi.setSystemTime(new Date(2026, 9, 23, 8, 30));
				await expect(
					service.confirmMedication(
						medId,
						'user-1',
						MedicationSection.MORNING,
						new Date(2026, 9, 21),
					),
				).rejects.toThrow(/48 hours/);
				expect(adherencesService.upsertAdherenceLog).not.toHaveBeenCalled();
			});

			it('rejects a dose from before the medication started', async () => {
				medicationsService.findOwnedById.mockResolvedValue({
					_id: medId,
					patient: 'p1',
					frequency: { repeatEvery: 1, repetitionType: 'daily' },
					startDate: new Date(2026, 9, 23, 9, 0),
					morning: { time: eightAm },
				} as any);

				await expect(
					service.confirmMedication(
						medId,
						'user-1',
						MedicationSection.MORNING,
						new Date(2026, 9, 22),
					),
				).rejects.toThrow(/before the medication started/);
			});

			it('still refuses a dose that is not due yet', async () => {
				await expect(
					service.confirmMedication(
						medId,
						'user-1',
						MedicationSection.MORNING,
						new Date(2026, 9, 24),
					),
				).rejects.toThrow(/not yet time/);
			});
		});

		it("should 404 on another user's medication without writing a log", async () => {
			const otherUsersMedId = new Types.ObjectId().toString();
			medicationsService.findOwnedById.mockRejectedValue(
				new NotFoundException('Medication not found'),
			);

			await expect(
				service.confirmMedication(
					otherUsersMedId,
					'user-1',
					MedicationSection.MORNING,
				),
			).rejects.toBeInstanceOf(NotFoundException);
			expect(adherencesService.upsertAdherenceLog).not.toHaveBeenCalled();
		});
	});
});
