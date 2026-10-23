import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { HydratedDocument, Model, Types } from 'mongoose';
import { BaseDH } from '../../../common/entities/base-dh.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { myEmitter } from '../../patients/utils/summary.event';
import { Sections, upsertSummary } from '../../patients/utils/summary.util';
import { upsertAdherencePattern } from '../utils/adherence.util';
import { upsertOverallAdherencePattern } from '../utils/overview.util';
import { AdherencePattern } from './adherence-pattern.entity';

export enum TargetType {
	MEDICATION = 'medication',
	EXERCISE = 'exercise',
	DIET = 'diet',
	VITALS = 'vitals',
	APPOINTMENT = 'appointment',
	OTHER = 'other',
}

export enum Status {
	TAKEN = 'taken',
	MISSED = 'missed',
	PARTIAL = 'partial',
}

@Schema({
	timestamps: true,
	toJSON: {
		transform: (_doc, ret: any) => {
			const id = ret._id;
			delete ret._id;
			delete ret.__v;
			return { id, ...ret };
		},
	},
})
export class AdherenceLog extends BaseDH {
	@Prop({
		required: true,
		description:
			'ID of the user logging adherence. Optional and may be undefined.',
	})
	userId: string;

	@Prop({
		index: true,
		type: ObjectId,
		ref: 'Patient',
		description: 'Patient ObjectId (patientId in request)',
	})
	patient: Patient;

	@Prop({
		type: String,
		enum: TargetType,
		description: "Type of adherence target. Example: 'medication', 'exercise'",
	})
	targetType: TargetType;

	@Prop({ description: "Name of the adherence target (e.g., 'Vitamin D')" })
	targetName: string;

	@Prop({
		index: true,
		type: ObjectId,
		ref: 'Medication',
		description:
			'Medication ObjectId this log belongs to, when targetType is medication. ' +
			'Optional — AI-inferred logs from chat text may only have targetName. ' +
			'Preferred over targetName for lookups/uniqueness when present, since a ' +
			'renamed medication would otherwise orphan its history.',
	})
	medication?: Types.ObjectId;

	@Prop({
		index: true,
		description:
			'The specific dose instance this log confirms (the scheduled dose ' +
			"datetime, e.g. today's 8am dose) — stable identity for a given dose, " +
			'independent of when it was actually confirmed. Optional for the same ' +
			'reason as `medication`.',
	})
	scheduledFor?: Date;

	@Prop({
		type: String,
		enum: ['morning', 'afternoon', 'evening'],
		description:
			"Which of the medication's daily doses this log settles. Kept so a " +
			"later change to that dose's time still finds this log. Older logs " +
			'without it are matched by time of day.',
	})
	section?: 'morning' | 'afternoon' | 'evening';

	@Prop({ description: 'Whether the target was taken/adhered to' })
	taken: boolean;

	@Prop({
		index: true,
		description:
			'The datetime the dose was actually confirmed/logged (not the scheduled ' +
			'time — see `scheduledFor` for that).',
	})
	takenAt: Date;

	@Prop({
		type: String,
		enum: Status,
		description: "AI inferred Status of adherence. Example: 'taken'",
	})
	status: Status;

	@Prop({ description: 'AI-generated additional notes about adherence' })
	notes: string;
}
export const AdherenceLogSchema = SchemaFactory.createForClass(AdherenceLog);

// One log per (medication, scheduled dose) — prevents a double-tap/retried
// confirm from creating duplicate logs for the same dose. Partial: only
// applies to medication-linked logs, since AI-inferred logs from chat text
// may not have a `medication`/`scheduledFor` at all.
AdherenceLogSchema.index(
	{ userId: 1, medication: 1, scheduledFor: 1 },
	{
		unique: true,
		partialFilterExpression: {
			medication: { $exists: true },
			scheduledFor: { $exists: true },
		},
	},
);

/** The 'upsertSummary' arguments that count one log in its patient's summary. */
function summaryUpdateArgs(
	doc: HydratedDocument<AdherenceLog>,
): Parameters<typeof upsertSummary> {
	return [
		Sections.ADHERENCES,
		{
			[Sections.ADHERENCES]: {
				data: doc,
				model: doc.model('AdherenceLog'),
			},
		},
		{ patientId: doc.patient, userId: doc.userId },
		doc.model('Summary'),
		doc.model('AugurNotification'),
	] as unknown as Parameters<typeof upsertSummary>;
}

/**
 * Counts a log written outside findOneAndUpdate (the missed-dose job) in
 * the patient's summary. Awaited rather than emitted, so the job's logs
 * for one patient update the summary one after another instead of racing.
 */
export async function recordInSummary(doc: HydratedDocument<AdherenceLog>) {
	await upsertSummary(...summaryUpdateArgs(doc));
}

AdherenceLogSchema.post<AdherenceLog>(
	'findOneAndUpdate',
	async function (doc: AdherenceLog | null) {
		if (doc) {
			myEmitter.emit(
				'upsertAdherencePattern',
				doc,
				doc.model('AdherenceLog'),
				doc.model('AdherencePattern'),
			);
			// myEmitter.emit(
			// 	'upsertOverallAdherencePattern',
			// 	doc,
			// 	doc.model('AdherenceLog'),
			// 	doc.model('AdherencePattern'),
			// );
			myEmitter.emit(
				'upsertSummary',
				...summaryUpdateArgs(doc as HydratedDocument<AdherenceLog>),
			);
			// await upsertAdherencePattern(
			// 	doc,
			// 	doc.model('AdherenceLog'),
			// 	doc.model('AdherencePattern'),
			// );
		}
	},
);

myEmitter.on(
	'upsertAdherencePattern',
	async (
		log: AdherenceLog,
		adherenceLogModel: Model<AdherenceLog>,
		adherencePatternModel: Model<AdherencePattern>,
	) => {
		await upsertAdherencePattern(log, adherenceLogModel, adherencePatternModel);
	},
);

myEmitter.on(
	'upsertOverallAdherencePattern',
	async (
		log: AdherenceLog,
		adherenceLogModel: Model<AdherenceLog>,
		adherencePatternModel: Model<AdherencePattern>,
	) => {
		await upsertOverallAdherencePattern(
			log,
			adherenceLogModel,
			adherencePatternModel,
		);
	},
);
