import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { anyIdForm } from '@/common/utils/helpers';

/** Version of the export layout, so a consumer can tell formats apart. */
export const PATIENT_EXPORT_FORMAT = 'yelima-patient-export/1';

type Section = {
	/** Mongoose model name, as registered with MongooseModule.forFeature. */
	model: string;
	filter: (ids: { userId: string; patientId: string }) => object;
	/** Fields left out: internal secrets, not personal data about the patient. */
	exclude?: string;
};

/**
 * Every collection holding the patient's personal data, by the key the
 * export uses. Keep in step with ClientService.purgePatient (erasure) and
 * docs/data-protection.md (data inventory).
 */
const SECTIONS: Record<string, Section> = {
	chronicConditions: {
		model: 'ChronicCondition',
		filter: ({ userId }) => ({ userId }),
	},
	medications: { model: 'Medication', filter: ({ userId }) => ({ userId }) },
	adherenceLogs: {
		model: 'AdherenceLog',
		filter: ({ userId }) => ({ userId }),
	},
	adherencePatterns: {
		model: 'AdherencePattern',
		filter: ({ userId }) => ({ userId }),
	},
	vitalHistories: {
		model: 'VitalHistory',
		filter: ({ userId }) => ({ userId }),
	},
	concerns: { model: 'Concern', filter: ({ userId }) => ({ userId }) },
	appointments: {
		model: 'Appointment',
		filter: ({ patientId }) => ({ patient: anyIdForm(patientId) }),
	},
	appointmentRequests: {
		model: 'AppointmentRequest',
		filter: ({ patientId }) => ({ patient: anyIdForm(patientId) }),
	},
	reminders: {
		model: 'AugurNotification',
		filter: ({ userId, patientId }) => ({
			$or: [{ userId }, { patient: anyIdForm(patientId) }],
		}),
		exclude: '-queueJobId',
	},
	clinicalSummaries: { model: 'Summary', filter: ({ userId }) => ({ userId }) },
	// The push token itself is a credential for the device, not data about
	// the patient; the export lists the devices without it.
	devices: {
		model: 'UserToken',
		filter: ({ userId }) => ({ userId }),
		exclude: '-fcmToken',
	},
	// Only present while the (retired) AI assistant module is loaded.
	aiChatMessages: {
		model: 'ClientAIChat',
		filter: ({ userId }) => ({ userId }),
	},
};

/**
 * Right of access / portability: one JSON document with everything stored
 * about a patient in MongoDB. Reads through the connection's registered
 * models so it sees each collection without depending on every feature
 * module; a model that isn't registered (a retired module) is skipped.
 */
@Injectable()
export class PatientDataExportService {
	constructor(@InjectConnection() private readonly connection: Connection) {}

	async exportByUserId(userId: string) {
		return this.export({ userId });
	}

	async exportByPatientId(patientId: string) {
		if (!Types.ObjectId.isValid(patientId)) {
			throw new NotFoundException('Patient not found');
		}
		return this.export({ _id: new Types.ObjectId(patientId) });
	}

	private async export(filter: object) {
		const patient = await this.model('Patient')
			?.findOne(filter)
			.select('-__v -qdrantId')
			.lean<Record<string, any>>();
		if (!patient) throw new NotFoundException('Patient not found');

		const ids = {
			userId: String(patient.userId),
			patientId: String(patient._id),
		};
		const data: Record<string, unknown[]> = {};
		for (const [key, section] of Object.entries(SECTIONS)) {
			const model = this.model(section.model);
			if (!model) continue;
			data[key] = await model
				.find(section.filter(ids))
				.select(['-__v', section.exclude].filter(Boolean).join(' '))
				.sort({ createdAt: 1 })
				.lean();
		}

		return {
			format: PATIENT_EXPORT_FORMAT,
			exportedAt: new Date().toISOString(),
			patient,
			...data,
		};
	}

	private model(name: string): Model<any> | undefined {
		return this.connection.models[name];
	}
}
