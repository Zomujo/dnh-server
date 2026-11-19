import { NotFoundException } from '@nestjs/common';
import { TestBed } from '@suites/unit';
import { Types } from 'mongoose';
import {
	PATIENT_EXPORT_FORMAT,
	PatientDataExportService,
} from './patient-data-export.service';

// GET /client/data-export and GET /hcp/patients/:id/data-export.
describe('PatientDataExportService', () => {
	let service: PatientDataExportService;
	let models: Record<string, any>;
	const patientId = new Types.ObjectId();
	const patient = { _id: patientId, userId: 'uid-1', name: 'Ama Mensah' };

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
		};
		(service as any).connection = { models };
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
		const result = await service.exportByUserId('uid-1');

		expect(result).not.toHaveProperty('aiChatMessages');
	});

	it('looks a patient up by id for a clinician', async () => {
		await service.exportByPatientId(patientId.toString());

		expect(models.Patient.findOne).toHaveBeenCalledWith({ _id: patientId });
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
