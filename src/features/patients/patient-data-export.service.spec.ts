import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TestBed } from '@suites/unit';
import { Types } from 'mongoose';
import {
	EXPORT_MODEL_NAMES,
	PATIENT_EXPORT_FORMAT,
	PatientDataExportService,
} from './patient-data-export.service';

/**
 * Model names registered through MongooseModule.forFeature anywhere in src.
 * Every registration uses `name: Entity.name`, and an entity's model name is
 * its class name, so the identifier is the model name.
 */
function registeredModelNames() {
	const src = join(__dirname, '..', '..');
	const names = new Set<string>();
	const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(
		(file) => file.endsWith('.module.ts'),
	);
	for (const file of files) {
		const text = readFileSync(join(src, file), 'utf8');
		for (const block of text.matchAll(/forFeature\(\[([\s\S]*?)\]\)/g)) {
			for (const [, name] of block[1].matchAll(/name:\s*(\w+)\.name/g)) {
				names.add(name);
			}
		}
	}
	return names;
}

// GET /client/data-export and GET /hcp/patients/:id/data-export.
describe('PatientDataExportService', () => {
	let service: PatientDataExportService;
	let models: Record<string, any>;
	const patientId = new Types.ObjectId();
	const patient = { _id: patientId, userId: 'uid-1', name: 'Ama Mensah' };
	// Registered by a clinician or pharmacy: no app account.
	const staffPatient = {
		_id: patientId,
		userId: 'hcp-0193',
		name: 'Kofi Boateng',
	};
	const facilityId = new Types.ObjectId().toString();

	/** A model whose find()/findOne() chain resolves to `rows`. */
	const model = (rows: unknown) => {
		const chain = {
			select: vi.fn().mockReturnThis(),
			sort: vi.fn().mockReturnThis(),
			lean: vi.fn().mockResolvedValue(rows),
		};
		return {
			chain,
			find: vi.fn().mockReturnValue(chain),
			findOne: vi.fn().mockReturnValue(chain),
		};
	};

	beforeEach(async () => {
		const { unit } = await TestBed.solitary(PatientDataExportService).compile();
		service = unit;
		models = {
			Patient: model(patient),
			ChronicCondition: model([{ conditionName: 'diabetes' }]),
			Medication: model([{ name: 'Metformin' }]),
			AdherenceLog: model([]),
			AdherencePattern: model([]),
			VitalHistory: model([{ vitalType: 'blood_pressure' }]),
			Concern: model([]),
			Appointment: model([]),
			AppointmentRequest: model([]),
			AugurNotification: model([]),
			Summary: model([]),
			UserToken: model([{ userType: 'dh-clients' }]),
			ClientAIChat: model([{ message: 'hello' }]),
		};
		(service as any).connection = { models };
		checkpointer = { getTuple: vi.fn().mockResolvedValue(undefined) };
		(service as any).checkpointer = checkpointer;
	});

	let checkpointer: { getTuple: ReturnType<typeof vi.fn> };

	describe('conversation history (LangGraph checkpoints)', () => {
		it("leaves out the AI's tool turns", async () => {
			checkpointer.getTuple.mockResolvedValue({
				checkpoint: {
					ts: '2026-11-01T08:00:00.000Z',
					channel_values: {
						messages: [
							new HumanMessage({ id: 'h1', content: 'My sugar is high' }),
							new AIMessage({
								id: 'a1',
								content: '',
								tool_calls: [{ id: 'c1', name: 'getVitals', args: {} }],
							}),
							new ToolMessage({
								id: 't1',
								content: '{"vitals":[]}',
								tool_call_id: 'c1',
							}),
							new AIMessage({ id: 'a2', content: 'Please see your clinician' }),
						],
					},
				},
			});

			const result = await service.exportByUserId('uid-1');

			expect(
				result.conversationHistory.messages.map((m: { id?: string }) => m.id),
			).toEqual(['h1', 'a2']);
		});

		it("reads the latest checkpoint on the patient's thread", async () => {
			const result = await service.exportByUserId('uid-1');

			expect(checkpointer.getTuple).toHaveBeenCalledWith({
				configurable: { thread_id: 'uid-1' },
			});
			expect(result.conversationHistory).toEqual({
				updatedAt: null,
				profile: null,
				messages: [],
			});
		});

		it('decodes reminders, chat turns and the profile copy', async () => {
			checkpointer.getTuple.mockResolvedValue({
				checkpoint: {
					ts: '2026-11-01T08:00:00.000Z',
					channel_values: {
						user: { name: 'Ama Mensah', phoneNumber: '+233201234567' },
						messages: [
							new AIMessage({
								id: 'm1',
								content: 'Time for your Metformin',
							}),
							new HumanMessage({ id: 'm2', content: 'Taken' }),
						],
					},
				},
			});

			const result = await service.exportByUserId('uid-1');

			expect(result.conversationHistory).toEqual({
				updatedAt: '2026-11-01T08:00:00.000Z',
				profile: { name: 'Ama Mensah', phoneNumber: '+233201234567' },
				messages: [
					{ id: 'm1', role: 'ai', content: 'Time for your Metformin' },
					{ id: 'm2', role: 'human', content: 'Taken' },
				],
			});
		});
	});

	it('returns the profile and every collection, keyed by the patient', async () => {
		const result = await service.exportByUserId('uid-1');

		expect(models.Patient.findOne).toHaveBeenCalledWith({ userId: 'uid-1' });
		expect(result).toMatchObject({
			format: PATIENT_EXPORT_FORMAT,
			patient,
			chronicConditions: [{ conditionName: 'diabetes' }],
			medications: [{ name: 'Metformin' }],
			vitalHistories: [{ vitalType: 'blood_pressure' }],
			adherenceLogs: [],
			appointments: [],
			appointmentRequests: [],
			reminders: [],
			devices: [{ userType: 'dh-clients' }],
		});
		expect(models.Medication.find).toHaveBeenCalledWith({ userId: 'uid-1' });
		// Appointments are keyed by the patient id, stored as string or ObjectId.
		expect(models.Appointment.find).toHaveBeenCalledWith({
			patient: { $in: [patientId.toString(), patientId] },
		});
		expect(models.AugurNotification.find).toHaveBeenCalledWith({
			$or: [
				{ userId: 'uid-1' },
				{ patient: { $in: [patientId.toString(), patientId] } },
			],
		});
	});

	it('leaves the device push token out', async () => {
		await service.exportByUserId('uid-1');

		expect(models.UserToken.chain.select).toHaveBeenCalledWith(
			'-__v -fcmToken',
		);
	});

	it('skips a collection whose module is not loaded', async () => {
		delete models.ClientAIChat;

		const result = await service.exportByUserId('uid-1');

		expect(result).not.toHaveProperty('aiChatMessages');
	});

	it('gives the patient their AI chat and devices (subject profile)', async () => {
		const result = await service.exportByUserId('uid-1');

		expect(result).toMatchObject({
			profile: 'subject',
			aiChatMessages: [{ message: 'hello' }],
			devices: [{ userType: 'dh-clients' }],
		});
		expect(models.AppointmentRequest.find).toHaveBeenCalledWith({
			patient: { $in: [patientId.toString(), patientId] },
		});
	});

	describe('clinician export (exportByPatientId)', () => {
		beforeEach(() => {
			models.Patient = model(staffPatient);
		});

		it('looks the patient up by id', async () => {
			await service.exportByPatientId(patientId.toString(), facilityId);

			expect(models.Patient.findOne).toHaveBeenCalledWith({ _id: patientId });
		});

		it('is a 403 for a patient with an app account', async () => {
			models.Patient = model(patient);

			await expect(
				service.exportByPatientId(patientId.toString(), facilityId),
			).rejects.toBeInstanceOf(ForbiddenException);
			expect(models.Medication.find).not.toHaveBeenCalled();
		});

		it('leaves out AI chat messages and devices', async () => {
			const result = await service.exportByPatientId(
				patientId.toString(),
				facilityId,
			);

			expect(result.profile).toBe('clinician');
			expect(result).not.toHaveProperty('aiChatMessages');
			expect(result).not.toHaveProperty('devices');
			expect(models.ClientAIChat.find).not.toHaveBeenCalled();
			expect(models.UserToken.find).not.toHaveBeenCalled();
			expect(result).toHaveProperty('medications');
		});

		it("includes the patient's reminder history", async () => {
			const result = await service.exportByPatientId(
				patientId.toString(),
				facilityId,
			);

			expect(checkpointer.getTuple).toHaveBeenCalledWith({
				configurable: { thread_id: 'hcp-0193' },
			});
			expect(result).toHaveProperty('conversationHistory');
		});

		it("keeps only appointment requests made to the caller's facility", async () => {
			await service.exportByPatientId(patientId.toString(), facilityId);

			expect(models.AppointmentRequest.find).toHaveBeenCalledWith({
				patient: { $in: [patientId.toString(), patientId] },
				host: { $in: [facilityId, new Types.ObjectId(facilityId)] },
			});
		});

		it('returns no appointment requests when the caller has no facility', async () => {
			await service.exportByPatientId(patientId.toString());

			expect(models.AppointmentRequest.find).toHaveBeenCalledWith({
				patient: { $in: [patientId.toString(), patientId] },
				host: { $in: [] },
			});
		});
	});

	it('reads only models registered with Mongoose', () => {
		const registered = registeredModelNames();

		expect(registered.size).toBeGreaterThan(0);
		for (const name of EXPORT_MODEL_NAMES) {
			expect(registered, `model ${name} is not registered`).toContain(name);
		}
	});

	it('is a 404 for an unknown patient or a malformed id', async () => {
		models.Patient = model(null);

		await expect(service.exportByUserId('nobody')).rejects.toBeInstanceOf(
			NotFoundException,
		);
		await expect(service.exportByPatientId('not-an-id')).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
});
