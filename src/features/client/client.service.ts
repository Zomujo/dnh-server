import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection } from '@nestjs/mongoose';
import { differenceInHours, endOfDay, startOfDay } from 'date-fns';
import { toHeaderCase } from 'js-convert-case';
import { Collection, Connection, isValidObjectId, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { generateFilter } from '@/common/factory';
import { escapeRegExp } from '@/common/utils/helpers';
import { CacheService } from '@/core/caching/caching.service';
import { FirebaseService } from '@/core/firebase/firebase.service';
import { AdherencesService } from '@/features/adherences/adherences.service';
import { TargetType } from '@/features/adherences/dto/target-type.enum';
import { Status } from '@/features/adherences/entities/adherence-log.entity';
import { doseTimeOn } from '@/features/adherences/utils/dose-schedule';
import { AppointmentRequestsService } from '@/features/appointments/appointment-requests/appointment-requests.service';
import type { CreateAppointmentRequestDto } from '@/features/appointments/appointment-requests/dto';
import { AppointmentsService } from '@/features/appointments/appointments.service';
import { ChronicConditionsService } from '@/features/chronic-conditions/chronic-conditions.service';
import { ConcernsService } from '@/features/concerns/concerns.service';
import {
	AddSymptomsDto,
	GetSymptomsQueryDto,
	UpdateConcernDto,
} from '@/features/concerns/dto';
import { GetFacilitiesQueryDto } from '@/features/facilities/dto';
import { FacilitiesService } from '@/features/facilities/facilities.service';
import {
	CreateMedicationDto,
	MAX_DOSE_CONFIRM_BACKDATE_HOURS,
	MedicationSection,
	UpdateMedicationDto,
} from '@/features/medications/dto';
import { MedicationsService } from '@/features/medications/medications.service';
import { SeededMedsService } from '@/features/medications/seeded-meds/seeded-meds.service';
import { NotificationsService } from '@/features/notifications/notifications.service';
import { PushService } from '@/features/notifications/push/push.service';
import { PatientsService } from '@/features/patients/patients.service';
import { VitalHistoriesService } from '@/features/vital-histories/vital-histories.service';
import { DhVectorsService } from '../dh-vectors/dh-vectors.service';
import {
	BpTrendsQueryDto,
	LoadVitalHistoryDto,
	VitalHistoryTrendsQueryDto,
} from '../vital-histories/dto';
import { ClientAIService } from './ai/ai.service';
import { ExtClientAIService } from './ai/ai-ext.service';
import { ClientAIChatService } from './ai/client-ai-chat.service';
import { SupportedLanguages } from './ai/states';
import {
	ChatTypes,
	ChronicCareQueryDto,
	ChronicChatMessagesQueryDto,
	CreateChronicCareDto,
	PreloadedMedsQueryDto,
	UserPayload,
} from './dto';

@Injectable()
export class ClientService {
	/**
	 * Hours after a dose's scheduled time beyond which a confirmation is
	 * recorded as PARTIAL rather than TAKEN, so a much-later catch-up confirm
	 * is distinguishable from on-time adherence.
	 */
	private static readonly LATE_WINDOW_HOURS = 4;

	private checkpointModel: Collection;
	private checkpointWritesModel: Collection;

	constructor(
		private readonly extClientAiService: ExtClientAIService,
		private readonly clientAiService: ClientAIService,
		private readonly userCacheService: CacheService<UserPayload>,
		private readonly chronicConditionsCacheService: CacheService<string[]>,
		private readonly patientsService: PatientsService,
		private readonly chronicConditionsService: ChronicConditionsService,
		private readonly medicationsService: MedicationsService,
		private readonly concernsService: ConcernsService,
		private readonly adherencesService: AdherencesService,
		private readonly firebaseService: FirebaseService,
		@InjectConnection() private connection: Connection,
		private readonly doctorNotificationsService: NotificationsService,
		private readonly clientAIChatService: ClientAIChatService,
		private readonly vitalHistoryService: VitalHistoriesService,
		private readonly dhVectorsService: DhVectorsService,
		private readonly appointmentsService: AppointmentsService,
		private readonly appointmentRequestsService: AppointmentRequestsService,
		private readonly seededMedsService: SeededMedsService,
		private readonly facilitiesService: FacilitiesService,
		private readonly eventEmitter: EventEmitter2,
		private readonly pushService: PushService,
	) {
		this.checkpointModel = this.connection.collection('checkpoints');
		this.checkpointWritesModel =
			this.connection.collection('checkpoint_writes');
	}

	async chat(
		dto: CreateChronicCareDto,
		userId: string,
		language: SupportedLanguages,
		chatType: ChatTypes = 'text',
	) {
		const patientChatsExists =
			await this.clientAIChatService.countChatsForPatient(userId);
		// const patientExists =
		// 	await this.patientsService.countPatientsByUserId(userId);

		if (!dto.message && patientChatsExists) {
			return { outResponse: null };
		}

		// A resend of a message we already answered (offline queue retry):
		// return the original pair instead of asking the AI again.
		if (dto.localChatId && chatType === 'text') {
			const previous = await this.clientAIChatService.findByLocalChatId(
				userId,
				dto.localChatId,
			);
			if (previous) {
				const reply = await this.clientAIChatService.findReplyTo(
					userId,
					previous.id,
				);
				if (reply) {
					return {
						outResponse: {
							_id: reply.id,
							text: reply.content,
							createdAt: reply.createdAt,
							suggestions: [],
						},
						inResponse: {
							_id: previous.id,
							createdAt: previous.createdAt,
							localChatId: dto.localChatId,
						},
					};
				}
				// Saved without a reply: drop it and answer afresh, as for audio.
				await this.clientAIChatService.deleteById(previous.id, userId);
			}
		}

		const patient = await this.retrievePatient(userId, language);

		const cCond = await this.retrieveChronicConditions(userId);

		const user = {
			patientId: patient._id.toString(),
			userId,
			name: patient.name,
			phoneNumber: patient.phoneNumber,
			chronicConditions: cCond,
		};

		const response = await this.clientAiService.bulkCompletion({
			message: dto.message || 'H\u200Bello',
			localChatId: chatType === 'text' ? dto.localChatId : undefined,
			userId,
			chatType,
			language,
			patient: user,
		});

		return response;
	}

	async chatAudio(
		file: Express.Multer.File,
		userId: string,
		language: SupportedLanguages,
		audioId: string,
	) {
		// Scoped to the caller: localChatId is client-generated, so an
		// unscoped lookup let one user's retry match (and delete, below)
		// another user's chat record.
		const audioIdPresent = await this.clientAIChatService.findByLocalChatId(
			userId,
			audioId,
		);
		if (audioIdPresent) {
			const response = await this.clientAIChatService.findNextAssistantMessage(
				userId,
				audioIdPresent.createdAt,
			);

			if (response) {
				return {
					outResponse: {
						_id: response.id,
						text: response.content,
						createdAt: response.createdAt,
						suggestions: [],
					},
					inResponse: {
						_id: audioIdPresent.id,
						createdAt: audioIdPresent.createdAt,
					},
				};
			}

			await this.clientAIChatService.deleteById(
				audioIdPresent._id.toString(),
				userId,
			);
		}

		const prevMessage =
			await this.clientAIChatService.findLastAssistantMessage(userId);

		const audioMongoId = new Types.ObjectId();
		const audioDocs = await this.extClientAiService.transcibeAudio(
			file,
			userId,
			audioId,
			audioMongoId,
			prevMessage?.content,
		);
		const transcript = audioDocs![0].pageContent;
		const chatResponse = await this.chat(
			{ message: transcript || '.' },
			userId,
			language,
			'audio',
		);

		if (chatResponse.outResponse) {
			chatResponse.inResponse._id = audioMongoId.toString();
		}

		return chatResponse;
	}

	async retrieveChatMessages(
		userId: string,
		query: ChronicChatMessagesQueryDto,
	) {
		const { pageFilter } = generateFilter(query);
		const messages = await this.clientAIChatService.findByUserId(
			userId,
			pageFilter.offset,
			pageFilter.limit,
		);

		const count = await this.clientAIChatService.countByUserId(userId);

		// Voice notes are stored without an access token; each history read
		// hands out a short-lived signed URL instead of a permanent link.
		const rows = await Promise.all(
			messages.map(async (message) => {
				const row = message.toJSON();
				// Only this user's own voice-note folder is ever signed.
				const objectPath =
					row.type === 'audio'
						? this.firebaseService.objectPathFromUrl(row.content)
						: null;
				if (objectPath?.startsWith(`chronic_care_chat_audios/${userId}/`)) {
					row.content = await this.firebaseService.signedUrlFor(row.content);
				}
				return row;
			}),
		);

		return { rows, count };
	}

	async removeChatMessages(chatmessageId: string, userId: string) {
		const whereOptions: Record<string, any> = { userId };

		if (isValidObjectId(chatmessageId)) {
			whereOptions._id = chatmessageId;
		} else {
			whereOptions.localChatId = chatmessageId;
		}

		await this.clientAIChatService.findOneAndDelete(whereOptions);

		return;
	}

	async retrieveChronicConditions(userId: string, limit: number = 5) {
		const key = `chronic-conditions:${userId}`;

		let chronicConds = await this.chronicConditionsCacheService.get(key);
		if (!chronicConds) {
			const chronicConditions =
				await this.chronicConditionsService.findByUserId(userId, 0, limit);
			chronicConds = chronicConditions.map((c) => c.conditionName);

			const fiftyMinsTtl = 50 * 60000;
			await this.chronicConditionsCacheService.set(
				key,
				chronicConds,
				fiftyMinsTtl,
			);
		}
		return chronicConds;
	}

	async retrievePatient(userId: string, language: SupportedLanguages) {
		const qdrantId = uuidv7();
		let patient = await this.patientsService.findPatientByUserId(
			userId,
			'_id createdAt updatedAt name phoneNumber language',
		);

		if (!patient) {
			let user = await this.userCacheService.get(userId);
			if (!user) {
				const fuser = await this.firebaseService.retrieveDoc('clients', userId);
				user = {
					name: fuser.doc.name,
					phoneNumber: `+${fuser.doc.phone_number.dial_code}${fuser.doc.phone_number.number}`,
				};
			}
			patient = await this.patientsService.createPatient({
				qdrantId,
				userId,
				name: user.name,
				language: language.toString(),
				phoneNumber: user.phoneNumber,
			});
		}

		return patient;
	}

	async fetchPatientData(userId: string) {
		const patient = await this.patientsService.findPatientByUserId(
			userId,
			'userId name yearOfBirth patientCode height gender',
		);
		if (!patient) {
			throw new NotFoundException('Patient not found');
		}
		return {
			id: patient._id,
			userId: patient.userId,
			name: patient.name,
			age: patient.age,
			gender: patient.gender,
			patientCode: patient.patientCode || null,
		};
	}

	async fetchChronicConditions(query: ChronicCareQueryDto, userId: string) {
		const { pageFilter } = generateFilter(query);
		const chronicConditions = await this.chronicConditionsService.findByUserId(
			userId,
			pageFilter.offset,
			pageFilter.limit,
		);

		const count = await this.chronicConditionsService.countByUserId(userId);

		return { chronicConditions, count };
	}

	async fetchMedications(query: ChronicCareQueryDto, userId: string) {
		const { pageFilter } = generateFilter(query);

		const medications = await this.medicationsService.findByUserId(
			userId,
			pageFilter.offset,
			pageFilter.limit,
		);

		const count = await this.medicationsService.countByUserId(userId);

		return { medications: medications || [], count };
	}

	async fetchAppointments(query: ChronicCareQueryDto, userId: string) {
		const response = await this.appointmentsService.findClientAppointments(
			query,
			userId,
		);
		return response;
	}

	async fetchNearestAppointment(userId: string) {
		return this.appointmentsService.findNearestAppointment(userId);
	}

	async createAppointmentRequest(
		dto: CreateAppointmentRequestDto,
		userId: string,
	) {
		const patient = await this.patientsService.findPatientByUserId(
			userId,
			'_id facility',
		);

		const request = await this.appointmentRequestsService.create({
			...dto,
			patient: patient!._id as any,
			host: patient!.facility as any,
		});

		const facilityId = patient!.facility?.toString();
		if (facilityId) {
			this.pushService.sendNotificationToTopic(
				() => ({
					notification: {
						title: 'New Appointment Request',
						body: 'A patient has submitted an appointment request at your facility.',
					},
					data: {
						notification_type: 'notification',
						click_action: 'FLUTTER_NOTIFICATION_CLICK',
					},
				}),
				facilityId,
			);
		}

		return request;
	}

	async fetchAppointmentRequests(query: ChronicCareQueryDto, userId: string) {
		const patient = await this.patientsService.findPatientByUserId(
			userId,
			'_id',
		);
		return this.appointmentRequestsService.findAll(
			query,
			patient!._id.toString(),
		);
	}

	/**
	 * How a confirmation is recorded given how late it arrived. Still counts as
	 * taken (the patient did take it), but flagged PARTIAL rather than TAKEN
	 * when well past schedule — there was previously no way to distinguish
	 * on-time adherence from a much-later catch-up confirmation.
	 */
	private classifyDoseStatus(scheduledFor: Date, confirmedAt: Date): Status {
		const hoursLate = differenceInHours(confirmedAt, scheduledFor);
		return hoursLate > ClientService.LATE_WINDOW_HOURS
			? Status.PARTIAL
			: Status.TAKEN;
	}

	async confirmMedication(
		medicationId: string,
		userId: string,
		section: MedicationSection,
		day: Date = new Date(),
	) {
		const medication = await this.medicationsService.findOwnedById(
			medicationId,
			userId,
		);

		if (!medication.frequency || !medication.startDate) {
			throw new NotFoundException('Medication has no frequency or start date');
		}

		const sectionKey = section.toLowerCase() as
			| 'morning'
			| 'afternoon'
			| 'evening';
		const schedule = medication[sectionKey] as any;
		if (!schedule?.time) {
			throw new NotFoundException(`No schedule defined for ${sectionKey}`);
		}

		// The scheduled dose datetime — the stable identity of "which dose" is
		// being confirmed (used for the unique index below), not when the
		// patient actually tapped confirm. See takenAt below for that.
		const scheduledFor = doseTimeOn(schedule.time, day);

		// Back-dated confirmations (a dose taken while offline) are allowed for
		// a short window only, and never before the course started. The 4 h
		// PARTIAL rule below still applies relative to this dose time.
		// Milliseconds, not differenceInHours: that truncates, which let a
		// dose up to 48h59m old through.
		if (
			Number.isNaN(scheduledFor.getTime()) ||
			Date.now() - scheduledFor.getTime() >
				MAX_DOSE_CONFIRM_BACKDATE_HOURS * 3_600_000
		) {
			throw new BadRequestException(
				`Doses can only be confirmed up to ${MAX_DOSE_CONFIRM_BACKDATE_HOURS} hours after they were due`,
			);
		}
		if (scheduledFor < startOfDay(medication.startDate)) {
			throw new BadRequestException(
				'Cannot confirm a dose from before the medication started',
			);
		}

		if (new Date() < scheduledFor) {
			const { hour, minutes, timeDesignators } = schedule.time;
			throw new BadRequestException(
				`Cannot confirm ${sectionKey} dose — it's not yet time (${hour}:${String(minutes).padStart(2, '0')} ${timeDesignators})`,
			);
		}

		const confirmedAt = new Date();

		try {
			// Single atomic upsert instead of a separate existence check +
			// insert — the filter excludes an already-confirmed dose
			// (taken: {$ne: true}), so a genuine duplicate confirm can't match
			// it and instead collides with the unique index on
			// (userId, medication, scheduledFor), raising E11000. This closes
			// the race between two concurrent confirms of the same dose that
			// the old check-then-insert pattern was vulnerable to.
			const logId = await this.adherencesService.upsertAdherenceLog(
				{
					userId,
					medication: new Types.ObjectId(medicationId),
					scheduledFor,
					taken: { $ne: true },
				},
				{
					userId,
					patient: medication.patient?.toString() ?? medication.patient,
					medication: new Types.ObjectId(medicationId),
					targetType: TargetType.MEDICATION,
					targetName: medication.name,
					scheduledFor,
					section: sectionKey,
					taken: true,
					takenAt: confirmedAt,
					status: this.classifyDoseStatus(scheduledFor, confirmedAt),
				} as any,
			);

			return { id: logId, scheduledFor, alreadyConfirmed: false };
		} catch (error: any) {
			if (error?.name === 'MongoServerError' && error?.code === 11000) {
				// Idempotent: the dose is already in exactly the state this
				// request wanted, so a double-tap or a network retry is a
				// no-op rather than a failure. The existing log's id is
				// returned so the caller can't tell the two paths apart
				// unless it looks at `alreadyConfirmed`.
				const existing = await this.adherencesService.findDoseLog(
					userId,
					medicationId,
					scheduledFor,
				);
				return {
					id: existing?._id,
					scheduledFor,
					alreadyConfirmed: true,
				};
			}
			throw error;
		}
	}
	async countTodaysMedications(userId: string) {
		return this.medicationsService.countBySchedules(userId);
	}

	async fetchTodaysMedications(section: MedicationSection, userId: string) {
		const sectionKey = section.toLowerCase() as
			| 'morning'
			| 'afternoon'
			| 'evening';
		const medications = await this.medicationsService.findBySchedule(
			userId,
			sectionKey,
		);

		const result: {
			id: string;
			name: string;
			dosage: string;
			purpose: string;
			toBeTakenAt: Date;
			taken: boolean;
		}[] = [];
		// Kept as ObjectIds rather than strings: the `$in` nested inside the
		// `$or` below is not cast against the schema, so string ids silently
		// match nothing and every dose comes back untaken.
		const medicationIds: Types.ObjectId[] = [];

		for (const med of medications) {
			const schedule = med[sectionKey] as any;
			if (!schedule?.time) continue;

			result.push({
				id: med._id.toString(),
				name: med.name,
				dosage: med.dosage,
				purpose: med.purpose,
				toBeTakenAt: doseTimeOn(schedule.time),
				taken: false,
			});
			medicationIds.push(med._id);
		}

		if (result.length === 0) return result;

		const todayStart = startOfDay(new Date());
		const todayEnd = endOfDay(new Date());
		const medNames = result.map((m) => m.name);

		// Scoped by `scheduledFor` (which dose) rather than `takenAt` (when the
		// patient tapped). Keying on takenAt dropped any dose confirmed after
		// midnight out of its own day's window, so a late-night confirm came
		// back as untaken. Legacy logs that predate `scheduledFor` have no dose
		// identity to filter on, so those two branches still fall back to
		// takenAt.
		const logs = await this.adherencesService.findAllAdherenceLogsByQuery({
			query: {
				userId,
				targetType: TargetType.MEDICATION,
				$or: [
					{
						medication: { $in: medicationIds },
						scheduledFor: { $gte: todayStart, $lte: todayEnd },
					},
					{
						medication: { $in: medicationIds },
						scheduledFor: { $exists: false },
						takenAt: { $gte: todayStart, $lte: todayEnd },
					},
					{
						medication: { $exists: false },
						targetName: { $in: medNames },
						takenAt: { $gte: todayStart, $lte: todayEnd },
					},
				],
			},
			projection: 'medication targetName taken takenAt scheduledFor',
			limit: 50,
		} as any);

		for (const item of result) {
			item.taken = logs.some((log: any) => {
				if (!log.taken) return false;

				// Identify the medication: by reference when the log has one,
				// by name only for logs that predate the `medication` field.
				if (log.medication) {
					if (log.medication.toString() !== item.id) return false;
				} else if (log.targetName !== item.name) {
					return false;
				}

				// Then identify the *dose*. Matching on the medication alone
				// marked every section of the day taken as soon as any single
				// dose was confirmed — confirming the 8am dose reported the 8pm
				// dose as already taken.
				if (log.scheduledFor) {
					return (
						new Date(log.scheduledFor).getTime() === item.toBeTakenAt.getTime()
					);
				}

				// No dose identity on the log at all; the confirming hour is
				// the only signal left.
				return (
					Math.abs(
						new Date(log.takenAt).getHours() - item.toBeTakenAt.getHours(),
					) <= 1
				);
			});
		}

		return result;
	}

	async fetchMedicationAdherenceLogs(
		medicationId: string,
		userId: string,
		date: Date,
	) {
		const medication = await this.medicationsService.findOwnedById(
			medicationId,
			userId,
		);
		const history = await this.adherencesService.medicationMonthHistory(
			userId,
			medicationId,
			date,
		);
		return { medicationName: medication.name, ...history };
	}

	async logVitalHistory(dto: LoadVitalHistoryDto, userId: string) {
		const patient = await this.patientsService.findPatientByUserId(
			userId,
			'_id facility',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		return this.vitalHistoryService.loadVitalHistory(
			{ ...dto, patient: patient._id.toString() },
			userId,
			patient.facility?.toString(),
		);
	}

	async fetchVitalHistory(userId: string) {
		const response = await this.vitalHistoryService.fetchVitalHistory(userId);
		return response;
	}

	async fetchVitalHistoryLogs(userId: string, offset: number, limit: number) {
		return this.vitalHistoryService.listVitalHistoryLogs(userId, offset, limit);
	}

	async fetchVitalTrend(userId: string, query: VitalHistoryTrendsQueryDto) {
		const response = await this.vitalHistoryService.fetchVitalTrend(
			userId,
			query,
		);
		return response;
	}

	async fetchBPTrend(userId: string, query: BpTrendsQueryDto) {
		const response = await this.vitalHistoryService.fetchBPTrend(userId, query);
		return response;
	}

	async fetchAdherencePatterns(query: ChronicCareQueryDto, userId: string) {
		const { pageFilter } = generateFilter(query);
		const subsLimit = 4;

		const result = await this.adherencesService.aggregateAdherencePatterns(
			userId,
			pageFilter.offset,
			pageFilter.limit,
			subsLimit,
		);

		const total =
			await this.adherencesService.countAdherencePatternGroups(userId);

		result.forEach((res) => {
			res.items.forEach((item: any) => {
				item.targetName = toHeaderCase(item.targetName);
			});
		});

		return { rows: result, count: total };
	}

	async fetchMedicationAdherence(userId: string, showWeekdays?: boolean) {
		const rate =
			await this.adherencesService.aggregateMedicationAdherence(userId);

		if (!showWeekdays) {
			return { rate };
		}

		const days =
			await this.adherencesService.aggregateMedicationTakenByWeek(userId);
		return { rate, days };
	}

	async fetchConcerns(query: ChronicCareQueryDto, userId: string) {
		const { pageFilter } = generateFilter(query);
		const concerns = await this.concernsService.findByUserId(
			userId,
			pageFilter.offset,
			pageFilter.limit,
		);

		const count = await this.concernsService.countByUserId(userId);

		return { concerns, count };
	}

	/**
	 * Deletes everything held for this account and reports how much of each
	 * kind was removed.
	 *
	 * Resumable: every step is a no-op once done, and the steps run so that a
	 * failure leaves what a retry needs. Anything that can still act on the
	 * user (reminders, push tokens) goes first; the patient row goes late
	 * because its id finds the patient-keyed rows; the Firebase Auth user goes
	 * last because deleting it invalidates the token a retry would use.
	 */
	async purgePatient(userId: string) {
		const count = (result: { deletedCount?: number }) =>
			result.deletedCount ?? 0;

		const patient = await this.patientsService.findPatientByUserId(
			userId,
			'_id',
		);
		const patientId = patient?._id?.toString();

		const reminders = await this.doctorNotificationsService.purgeNotifications(
			userId,
			patientId,
		);
		const fcmTokens = await this.pushService.removeAllForUser(userId);
		const appointments = patientId
			? await this.appointmentsService.removeByPatientId(patientId)
			: 0;
		const appointmentRequests = patientId
			? await this.appointmentRequestsService.removeByPatientId(patientId)
			: 0;

		const [chat] = await this.eventEmitter.emitAsync('patient.purge.chat', {
			userId,
		});

		const aiChatMessages = count(
			await this.clientAIChatService.removeByUserId(userId),
		);
		const aiConversationState =
			count(await this.checkpointModel.deleteMany({ thread_id: userId })) +
			count(await this.checkpointWritesModel.deleteMany({ thread_id: userId }));
		const voiceNoteFiles = await this.firebaseService.deleteFolder(
			`chronic_care_chat_audios/${userId}`,
		);

		const medications = count(
			await this.medicationsService.removeByUserId(userId),
		);
		const adherenceLogs = count(
			await this.adherencesService.removeLogsByUserId(userId),
		);
		const adherencePatterns = count(
			await this.adherencesService.removePatternsByUserId(userId),
		);
		const vitals = count(await this.vitalHistoryService.removeByUserId(userId));
		const symptoms = count(await this.concernsService.removeByUserId(userId));
		const chronicConditions = count(
			await this.chronicConditionsService.removeByUserId(userId),
		);
		const summaries = count(
			await this.patientsService.removeSummariesByUserId(userId),
		);
		await this.dhVectorsService.cleanOrphans(userId);

		await Promise.all([
			this.userCacheService.delete(userId),
			this.chronicConditionsCacheService.delete(`chronic-conditions:${userId}`),
		]);
		const firestoreDocuments =
			await this.firebaseService.deleteClientRecords(userId);

		const patientRecords = count(
			await this.patientsService.removePatientsByUserId(userId),
		);
		const authUser = Number(await this.firebaseService.deleteAuthUser(userId));

		return {
			deleted: {
				patient: patientRecords,
				medications,
				adherenceLogs,
				adherencePatterns,
				vitals,
				symptoms,
				chronicConditions,
				summaries,
				reminders,
				appointments,
				appointmentRequests,
				chatRooms: chat?.chatRooms ?? 0,
				chatMessages: chat?.chatMessages ?? 0,
				aiChatMessages,
				aiConversationState,
				voiceNoteFiles,
				fcmTokens,
				firestoreDocuments,
				authUser,
			},
		};
	}

	async createMedication(dto: CreateMedicationDto, userId: string) {
		const patient = await this.patientsService.findPatientByUserId(
			userId,
			'_id',
		);
		return this.medicationsService.create(dto, userId, patient!._id.toString());
	}

	async deleteMedication(id: string, userId: string) {
		return this.medicationsService.remove(id, userId);
	}

	async updateMedication(id: string, dto: UpdateMedicationDto, userId: string) {
		return this.medicationsService.update(id, dto, userId);
	}

	async fetchMedicationById(id: string, userId: string) {
		return this.medicationsService.findOwnedById(id, userId);
	}

	async fetchPreloadedMeds(query: PreloadedMedsQueryDto) {
		const filter: Record<string, any> = {};
		if (query.search) {
			filter.name = {
				$regex: `^${escapeRegExp(query.search)}`,
				$options: 'i',
			};
		}
		const page = query.page || 1;
		const pageSize = query.pageSize || 10;
		return this.seededMedsService.findAllPaginated(filter, page, pageSize);
	}

	async fetchFacilities(query: GetFacilitiesQueryDto) {
		return this.facilitiesService.findAll(query);
	}

	async createSymptom(userId: string, dto: AddSymptomsDto) {
		return this.concernsService.create(userId, dto);
	}

	async fetchSymptoms(userId: string, query: GetSymptomsQueryDto) {
		return this.concernsService.fetchSymptoms(userId, query);
	}

	async fetchSymptomById(id: string, userId: string) {
		return this.concernsService.findSymptomById(id, userId);
	}

	async updateSymptom(id: string, userId: string, dto: UpdateConcernDto) {
		return this.concernsService.updateSymptom(id, userId, dto);
	}

	async deleteSymptom(id: string, userId: string) {
		return this.concernsService.deleteSymptom(id, userId);
	}
}
