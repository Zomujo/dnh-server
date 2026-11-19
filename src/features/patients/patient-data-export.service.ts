import type { BaseMessage } from '@langchain/core/messages';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { anyIdForm } from '@/common/utils/helpers';

/** Version of the export layout, so a consumer can tell formats apart. */
export const PATIENT_EXPORT_FORMAT = 'yelima-patient-export/1';

/** Prefix of the userId given to a patient registered by staff, not the app. */
export const STAFF_REGISTERED_USER_ID_PREFIX = 'hcp-';

/**
 * Who the export is for. `subject`: the patient themselves (everything).
 * `clinician`: a clinician handing a patient without the app their data;
 * limited to what the clinician's role already shows them.
 */
export type ExportProfile = 'subject' | 'clinician';

type ExportContext = {
	userId: string;
	patientId: string;
	/** The calling clinician's facility (clinician profile only). */
	facilityId?: string;
};

type Section = {
	/** Mongoose model name, as registered with MongooseModule.forFeature. */
	model: string;
	filter: (ctx: ExportContext) => object;
	/** Fields left out: internal secrets, not personal data about the patient. */
	exclude?: string;
	/** Filter for the clinician profile; `false` leaves the section out. */
	clinician?: false | ((ctx: ExportContext) => object);
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
		// A clinician sees only the requests made to their own facility.
		clinician: ({ patientId, facilityId }) => ({
			patient: anyIdForm(patientId),
			host: facilityId ? anyIdForm(facilityId) : { $in: [] },
		}),
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
		clinician: false,
	},
	// Only present while the (retired) AI assistant module is loaded.
	aiChatMessages: {
		model: 'ClientAIChat',
		filter: ({ userId }) => ({ userId }),
		clinician: false,
	},
};

/** Model names the export reads, for the registration check in the spec. */
export const EXPORT_MODEL_NAMES = [
	'Patient',
	...Object.values(SECTIONS).map((section) => section.model),
];

/**
 * Right of access / portability: one JSON document with what is stored
 * about a patient in MongoDB. Reads through the connection's registered
 * models so it sees each collection without depending on every feature
 * module; a model that isn't registered (a retired module) is skipped.
 *
 * Also exported: the conversation history LangGraph keeps per patient in
 * `checkpoints` (thread_id = userId). Dose reminders are written there
 * whether or not the AI assistant is switched on.
 *
 * Not exported: the retired clinician-patient chat (rooms and messages),
 * the Firestore profile mirror and the Firebase Auth record. See
 * docs/data-protection.md.
 */
@Injectable()
export class PatientDataExportService {
	private checkpointer?: MongoDBSaver;

	constructor(@InjectConnection() private readonly connection: Connection) {}

	/** The patient's own export (GET /client/data-export). */
	async exportByUserId(userId: string) {
		const patient = await this.findPatient({ userId });
		return this.export(patient, 'subject');
	}

	/**
	 * A clinician's export for a patient without an app account (registered
	 * at a facility or a pharmacy, or USSD only), who has no other way to
	 * get their data. An app user exports their own data, so this is a 403
	 * for them: it would otherwise hand any clinician a bulk copy of any
	 * patient's record. Uses the clinician profile.
	 */
	async exportByPatientId(patientId: string, facilityId?: string) {
		if (!Types.ObjectId.isValid(patientId)) {
			throw new NotFoundException('Patient not found');
		}
		const patient = await this.findPatient({
			_id: new Types.ObjectId(patientId),
		});
		if (!String(patient.userId).startsWith(STAFF_REGISTERED_USER_ID_PREFIX)) {
			throw new ForbiddenException(
				'This patient has an app account and can export their own data from the app',
			);
		}
		return this.export(patient, 'clinician', facilityId);
	}

	private async findPatient(filter: object) {
		const patient = await this.model('Patient')
			?.findOne(filter)
			.select('-__v -qdrantId')
			.lean<Record<string, any>>();
		if (!patient) throw new NotFoundException('Patient not found');
		return patient;
	}

	private async export(
		patient: Record<string, any>,
		profile: ExportProfile,
		facilityId?: string,
	) {
		const ctx: ExportContext = {
			userId: String(patient.userId),
			patientId: String(patient._id),
			facilityId,
		};
		const data: Record<string, unknown[]> = {};
		for (const [key, section] of Object.entries(SECTIONS)) {
			const filter =
				profile === 'clinician' && section.clinician !== undefined
					? section.clinician
					: section.filter;
			if (!filter) continue;
			const model = this.model(section.model);
			if (!model) continue;
			data[key] = await model
				.find(filter(ctx))
				.select(['-__v', section.exclude].filter(Boolean).join(' '))
				.sort({ createdAt: 1 })
				.lean();
		}

		return {
			format: PATIENT_EXPORT_FORMAT,
			profile,
			exportedAt: new Date().toISOString(),
			patient,
			...data,
			// A staff-registered patient has no app, so their thread holds only
			// dose reminders: nothing beyond what the clinician profile shows.
			conversationHistory: await this.conversationHistory(ctx.userId),
		};
	}

	/**
	 * The latest LangGraph checkpoint for the patient's thread, decoded:
	 * every message on the thread (dose reminders, and AI chat turns when
	 * the assistant is on) and the profile copy the graph keeps (name,
	 * phone, language). Empty when the patient has no thread.
	 */
	async conversationHistory(userId: string) {
		this.checkpointer ??= new MongoDBSaver({
			client: this.connection.getClient() as any,
			dbName: this.connection.db?.databaseName,
		});
		const tuple = await this.checkpointer.getTuple({
			configurable: { thread_id: userId },
		});
		const values = (tuple?.checkpoint.channel_values ?? {}) as {
			messages?: BaseMessage[];
			user?: Record<string, unknown> | null;
		};
		// Per-message send times aren't recoverable: the checkpoint serializer
		// stores the Date in additional_kwargs as an empty object. When each
		// reminder was due is in the `reminders` section.
		return {
			updatedAt: tuple?.checkpoint.ts ?? null,
			profile: values.user ?? null,
			messages: (values.messages ?? []).map((message) => ({
				id: message.id,
				role: message.getType(),
				content: message.content,
			})),
		};
	}

	private model(name: string): Model<any> | undefined {
		return this.connection.models[name];
	}
}
