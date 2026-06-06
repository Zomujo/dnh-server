import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from '@/common/entities';
import { deleteByPattern } from '@/core/caching/utils';
import { BaseDH } from '../../../common/entities/base-dh.entity';
import { Patient } from '../../patients/entities/patient.entity';
import {
	NotificationChannel,
	NotificationPriority,
	NotificationTone,
	NotificationType,
	RepetitionType,
} from '../dto/notification.dto';

@Schema({ _id: false })
export class Frequency {
	@Prop({ description: 'Number of time units between each repetition' })
	repeatEvery: number;

	@Prop({
		type: String,
		enum: RepetitionType,
		description: 'Unit of time for repetition (e.g., daily, weekly, hourly)',
	})
	repetitionType: RepetitionType;
}

export const FrequencySchema = SchemaFactory.createForClass(Frequency);

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
export class AugurNotification extends BaseDH {
	@Prop({ index: true, description: 'Required User ID (3–50 characters)' })
	userId: string;

	@Prop({
		index: true,
		type: ObjectId,
		ref: 'Patient',
		description:
			"ID of the patient (MongoDB ObjectId). Example: '678fa53f3a0ba70822aa3555'",
	})
	patient: Patient;

	@Prop({
		type: String,
		enum: NotificationType,
		description: "Type/category of notification. Example: 'reminder'",
	})
	notificationType: NotificationType;

	@Prop({
		type: String,
		enum: ['medication', 'exercise', 'diet', 'vitals', 'appointment', 'other'],
		description: "Type of adherence target. Example: 'medication'",
	})
	targetType: string;

	@Prop({ description: "Name of the adherence target (e.g., 'Vitamin D')" })
	targetName: string;

	@Prop({
		index: true,
		description: 'Date and time when notifications should start',
	})
	startDate: Date;

	@Prop({
		description: 'Optional date and time when notifications should stop',
	})
	endDate: Date;

	@Prop({
		index: true,
		description: 'Time of day when notification should be sent (HH:mm format)',
	})
	timeOfDay: string;

	@Prop({
		type: String,
		enum: NotificationTone,
		description:
			"Desired tone or style of the notification message. Example: 'friendly'",
	})
	tone: NotificationTone;

	@Prop({
		type: String,
		enum: NotificationChannel,
		description:
			"Delivery channel for sending the notification. Example: 'push'",
	})
	channel: NotificationChannel;

	@Prop({
		type: Number,
		default: 120,
		description: 'Maximum character limit for the message. Example: 160',
	})
	characterLimit: number;

	@Prop({
		description:
			"The goal or call-to-action expected from the notification. Example: 'Confirm attendance'",
	})
	goal: string;

	@Prop({
		type: String,
		enum: NotificationPriority,
		description: "Priority level of the notification. Example: 'high'",
	})
	priority: NotificationPriority;

	@Prop({
		type: [String],
		default: [],
		description: 'Constraints for the message. Example: [no emojis, no links]',
	})
	constraints: string[];

	@Prop({
		type: FrequencySchema,
		description:
			'Settings for repetitive notifications. Example: { repeatEvery: 2, repetitionType: daily }',
	})
	frequency: Frequency;

	@Prop({
		type: Boolean,
		default: false,
		description: 'Whether to generate a fallback message if data is missing',
	})
	useFallback: boolean;

	@Prop({
		default: 'Africa/Accra',
		description: "Patient's timezone in IANA format. Example: 'Africa/Accra'",
	})
	timezone: string;

	@Prop({
		default: null,
		index: true,
		description: 'Last time a notification was sent',
	})
	lastNotifiedAt: Date;

	@Prop({
		default: null,
		index: true,
		description: 'Next scheduled time for notification',
	})
	toBeNotifiedAt: Date;

	@Prop({ description: 'Queue job ID for tracking notification delivery' })
	queueJobId: string;
}

export const AugurNotificationSchema =
	SchemaFactory.createForClass(AugurNotification);

AugurNotificationSchema.post<AugurNotification>('save', async function (doc) {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=${doc.userId}*chronic-care*notifications*`,
	);
});

AugurNotificationSchema.post<AugurNotification>(
	'findOneAndUpdate',
	async function (doc: AugurNotification | null) {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=${doc ? doc.userId : ''}*chronic-care*notifications*`,
		);
	},
);

AugurNotificationSchema.post<AugurNotification>(
	'findOneAndDelete',
	async function () {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=*chronic-care*notifications*`,
		);
	},
);

AugurNotificationSchema.post<AugurNotification>(
	'deleteMany',
	async function () {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=*chronic-care*notifications*`,
		);
	},
);
