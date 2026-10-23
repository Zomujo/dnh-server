import { TestBed } from '@suites/unit';
import { Types } from 'mongoose';
import { ClientService } from './client.service';

// Account deletion (DELETE /client/clean). The step order is what makes it
// resumable, so these pin it rather than just the happy path.
describe('ClientService.purgePatient', () => {
	let service: ClientService;
	let deps: Record<string, any>;
	const calls: string[] = [];

	const track = (name: string, value: unknown) =>
		vi.fn().mockImplementation(async () => {
			calls.push(name);
			return value;
		});

	beforeEach(async () => {
		const { unit } = await TestBed.solitary(ClientService).compile();
		service = unit;
		deps = service as any;
		calls.length = 0;
		const deleted = (n: number) => ({ deletedCount: n });

		deps.patientsService.findPatientByUserId = vi
			.fn()
			.mockResolvedValue({ _id: new Types.ObjectId() });
		deps.doctorNotificationsService.purgeNotifications = track('reminders', 2);
		deps.pushService.removeAllForUser = track('fcmTokens', 1);
		deps.appointmentsService.removeByPatientId = track('appointments', 1);
		deps.appointmentRequestsService.removeByPatientId = track('requests', 0);
		deps.eventEmitter.emitAsync = track('chat', [
			{ chatRooms: 1, chatMessages: 4 },
		]);
		deps.clientAIChatService.removeByUserId = track('aiChats', deleted(6));
		deps.checkpointModel = { deleteMany: track('checkpoints', deleted(3)) };
		deps.checkpointWritesModel = {
			deleteMany: track('checkpointWrites', deleted(9)),
		};
		deps.firebaseService.deleteFolder = track('voiceNotes', 2);
		deps.medicationsService.removeByUserId = track('medications', deleted(3));
		deps.adherencesService.removeLogsByUserId = track('logs', deleted(10));
		deps.adherencesService.removePatternsByUserId = track(
			'patterns',
			deleted(1),
		);
		deps.vitalHistoryService.removeByUserId = track('vitals', deleted(42));
		deps.concernsService.removeByUserId = track('symptoms', deleted(2));
		deps.chronicConditionsService.removeByUserId = track(
			'conditions',
			deleted(1),
		);
		deps.patientsService.removeSummariesByUserId = track(
			'summaries',
			deleted(1),
		);
		deps.dhVectorsService.cleanOrphans = track('vectors', undefined);
		deps.userCacheService.delete = track('userCache', true);
		deps.chronicConditionsCacheService.delete = track('conditionsCache', true);
		deps.firebaseService.deleteClientRecords = track('firestore', 3);
		deps.patientsService.removePatientsByUserId = track('patient', deleted(1));
		deps.firebaseService.deleteAuthUser = track('authUser', true);
	});

	it('removes everything and reports counts', async () => {
		const result = await service.purgePatient('uid-1');

		expect(result.deleted).toEqual({
			patient: 1,
			medications: 3,
			adherenceLogs: 10,
			adherencePatterns: 1,
			vitals: 42,
			symptoms: 2,
			chronicConditions: 1,
			summaries: 1,
			reminders: 2,
			appointments: 1,
			appointmentRequests: 0,
			chatRooms: 1,
			chatMessages: 4,
			aiChatMessages: 6,
			aiConversationState: 12,
			voiceNoteFiles: 2,
			fcmTokens: 1,
			firestoreDocuments: 3,
			authUser: 1,
		});
		expect(deps.eventEmitter.emitAsync).toHaveBeenCalledWith(
			'patient.purge.chat',
			{ userId: 'uid-1' },
		);
	});

	it('deletes the patient after its patient-keyed rows, and the auth user last', async () => {
		await service.purgePatient('uid-1');

		expect(calls.at(-1)).toBe('authUser');
		expect(calls.at(-2)).toBe('patient');
		expect(calls.indexOf('appointments')).toBeLessThan(
			calls.indexOf('patient'),
		);
		expect(calls.indexOf('reminders')).toBe(0);
	});

	it('stops before the patient and auth user when a step fails, so a retry can finish', async () => {
		deps.vitalHistoryService.removeByUserId = vi
			.fn()
			.mockRejectedValue(new Error('db timeout'));

		await expect(service.purgePatient('uid-1')).rejects.toThrow('db timeout');
		expect(deps.patientsService.removePatientsByUserId).not.toHaveBeenCalled();
		expect(deps.firebaseService.deleteAuthUser).not.toHaveBeenCalled();
	});

	it('is a clean no-op on a repeat once the patient is gone', async () => {
		deps.patientsService.findPatientByUserId = vi.fn().mockResolvedValue(null);
		deps.firebaseService.deleteAuthUser = vi.fn().mockResolvedValue(false);

		const result = await service.purgePatient('uid-1');

		expect(deps.appointmentsService.removeByPatientId).not.toHaveBeenCalled();
		expect(result.deleted.appointments).toBe(0);
		expect(result.deleted.authUser).toBe(0);
	});
});
