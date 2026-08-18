import { EventEmitter2 } from '@nestjs/event-emitter';
import { type Mocked, TestBed } from '@suites/unit';
import { AdherencesService } from '@/features/adherences/adherences.service';
import { ChronicConditionsService } from '@/features/chronic-conditions/chronic-conditions.service';
import { ConcernsService } from '@/features/concerns/concerns.service';
import { MedicationsService } from '@/features/medications/medications.service';
import { NotificationsService } from '@/features/notifications/notifications.service';
import { PatientsService } from '@/features/patients/patients.service';
import { VitalHistoriesService } from '@/features/vital-histories/vital-histories.service';
import { VigilSentinelService } from '../vigil-sentinel/vigil-sentinel.service';
import { MemoryScribeService } from './memory-scribe.service';

describe('MemoryScribeService', () => {
	let service: MemoryScribeService;
	let adherencesService: Mocked<AdherencesService>;
	let chronicConditionsService: Mocked<ChronicConditionsService>;
	let concernsService: Mocked<ConcernsService>;
	let medicationsService: Mocked<MedicationsService>;
	let patientsService: Mocked<PatientsService>;
	let vitalHistoriesService: Mocked<VitalHistoriesService>;
	let notificationsService: Mocked<NotificationsService>;
	let vigilSentinelService: Mocked<VigilSentinelService>;
	let eventEmitter: Mocked<EventEmitter2>;

	beforeAll(async () => {
		const { unit, unitRef } =
			await TestBed.solitary(MemoryScribeService).compile();

		service = unit;
		adherencesService = unitRef.get(AdherencesService);
		chronicConditionsService = unitRef.get(ChronicConditionsService);
		concernsService = unitRef.get(ConcernsService);
		medicationsService = unitRef.get(MedicationsService);
		patientsService = unitRef.get(PatientsService);
		vitalHistoriesService = unitRef.get(VitalHistoriesService);
		notificationsService = unitRef.get(NotificationsService);
		vigilSentinelService = unitRef.get(VigilSentinelService);
		eventEmitter = unitRef.get(EventEmitter2);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('DynamicStructuredTools emission', () => {
		it('memoryTools should expose defined scribe tools that emit eventEmitter events', async () => {
			const emitSpy = (eventEmitter.emit = vi.fn());

			const tools = service.memoryTools;
			expect(tools).toHaveProperty('adherenceLogsScribe');

			const adherenceTool = tools.adherenceLogsScribe;
			const validPayload = {
				filters: {
					userId: 'u1',
					patient: '64b1f2a7a2b3c9d5f8e2a111',
					targetType: 'medication' as const,
					targetName: 'Metformin',
					takenAt: new Date().toISOString(),
				},
				data: {
					userId: 'u1',
					patient: '64b1f2a7a2b3c9d5f8e2a111',
					targetType: 'medication' as const,
					targetName: 'Metformin',
					taken: true,
					status: 'taken' as const,
				},
			};

			const res = await adherenceTool.invoke(validPayload as any);

			expect(res).toBe('queued');
			expect(emitSpy).toHaveBeenCalledWith(
				'adherenceLog.persist',
				validPayload,
			);
		});
	});

	describe('@OnEvent persistence handlers', () => {
		it('adherenceLogEvent should call adherencesService.upsertAdherenceLog', async () => {
			const payload = {
				filters: { userId: 'u1', patient: 'p1' } as any,
				data: { taken: true } as any,
			};

			await service.adherenceLogEvent(payload);

			expect(adherencesService.upsertAdherenceLog).toHaveBeenCalledWith(
				payload.filters,
				payload.data,
			);
		});

		it('adherencePatternEvent should call adherencesService.upsertAdherencePattern', async () => {
			const payload = {
				filters: { userId: 'u1', patient: 'p1' } as any,
				data: { pattern: 'morning' } as any,
			};

			await service.adherencePatternEvent(payload);

			expect(adherencesService.upsertAdherencePattern).toHaveBeenCalledWith(
				payload.filters,
				payload.data,
			);
		});

		it('chronicConditionEvent should call chronicConditionsService.upsertChronicCondition', async () => {
			const payload = {
				filters: { userId: 'u1', patient: 'p1' } as any,
				data: { conditionName: 'Hypertension' } as any,
			};

			await service.chronicConditionEvent(payload);

			expect(
				chronicConditionsService.upsertChronicCondition,
			).toHaveBeenCalledWith(payload.filters, payload.data);
		});

		it('concernEvent should call concernsService.upsertConcern', async () => {
			const payload = {
				filters: { userId: 'u1', patient: 'p1' } as any,
				data: { description: 'Headache' } as any,
			};

			await service.concernEvent(payload);

			expect(concernsService.upsertConcern).toHaveBeenCalledWith(
				payload.filters,
				payload.data,
			);
		});

		it('medicationEvent should call medicationsService.upsertMedication', async () => {
			const payload = {
				filters: { userId: 'u1', patient: 'p1' } as any,
				data: { name: 'Metformin' } as any,
			};

			await service.medicationEvent(payload);

			expect(medicationsService.upsertMedication).toHaveBeenCalledWith(
				payload.filters,
				payload.data,
			);
		});

		it('patientEvent should call patientsService.upsertPatient', async () => {
			const payload = {
				filters: { userId: 'u1', patient: 'p1' } as any,
				data: { name: 'John Doe' } as any,
			};

			await service.patientEvent(payload);

			expect(patientsService.upsertPatient).toHaveBeenCalledWith(
				payload.filters,
				payload.data,
			);
		});

		it('vitalHistoryEvent should call vitalHistoriesService.upsertVitalHistory', async () => {
			const payload = {
				filters: { userId: 'u1', patient: 'p1' } as any,
				data: { vitalType: 'bloodPressure', value: '120/80' } as any,
			};

			await service.vitalHistoryEvent(payload);

			expect(vitalHistoriesService.upsertVitalHistory).toHaveBeenCalledWith(
				payload.filters,
				payload.data,
			);
		});

		it('notificationEvent should call notificationsService.upsertNotification', async () => {
			const payload = {
				filters: { userId: 'u1' } as any,
				data: { title: 'Meds Reminder' } as any,
			};

			await service.notificationEvent(payload);

			expect(notificationsService.upsertNotification).toHaveBeenCalledWith(
				payload.filters,
				payload.data,
			);
		});

		it('vigilSentinelAlertEvent should call vigilSentinelService.alertFacility', async () => {
			const payload = {
				filters: { userId: 'u1', patient: 'patient-999' },
				data: { summary: 'Severe chest pain' },
			};

			await service.vigilSentinelAlertEvent(payload);

			expect(vigilSentinelService.alertFacility).toHaveBeenCalledWith({
				patientId: 'patient-999',
				summary: 'Severe chest pain',
			});
		});

		it('should catch errors gracefully without throwing when persistence fails', async () => {
			adherencesService.upsertAdherenceLog.mockRejectedValue(
				new Error('DB failure'),
			);

			const payload = {
				filters: { userId: 'u1', patient: 'p1' } as any,
				data: { taken: true } as any,
			};

			await expect(service.adherenceLogEvent(payload)).resolves.not.toThrow();
		});
	});
});
