import { z } from 'zod';
import { createMongoQuerySchema } from '@/features/client/ai/agents/requiem/state';

export const NotificationTypeEnum = z
	.enum(['reminder', 'alert', 'update', 'promotion', 'motivation', 'system'])
	.describe("Type/category of notification. Example: 'reminder'");

export const NotificationToneEnum = z
	.enum(['friendly', 'professional', 'urgent', 'casual', 'empathetic'])
	.describe(
		"Desired tone or style of the notification message. Example: 'friendly'",
	);

export const NotificationChannelEnum = z
	.enum(['push'])
	.describe("Delivery channel for sending the notification. Example: 'push'");

export const NotificationPriorityEnum = z
	.enum(['low', 'medium', 'high'])
	.describe("Priority level of the notification. Example: 'high'");

export const RepetitionTypeEnum = z
	.enum([
		'everySecond',
		'everyMinute',
		'hourly',
		'daily',
		'weekly',
		'monthly',
		'yearly',
	])
	.describe(
		"Unit of time for repetition frequency. Examples: 'daily', 'weekly', 'hourly', etc.",
	);

export const SchemaTargetType = z
	.enum(['medication', 'exercise', 'diet', 'vitals', 'appointment', 'other'])
	.describe(
		"Type of adherence target. Example: 'medication', 'exercise'. " +
			'! In `filters`, keep the past value if changed in the present so the system can correctly identify the log.',
	);

export const FrequencySchema = z
	.object({
		repeatEvery: z
			.number()
			.optional()
			.describe(
				'Number of time units between each repetition. Directly parsed from patient statements.',
			),
		repetitionType: RepetitionTypeEnum.optional(),
	})
	.describe(
		"Settings for repetitive notifications. Direct mapping from patient statements. Example: { repeatEvery: 2, repetitionType: 'daily' }",
	);

export const UpsertNotificationSchema = z
	.object({
		notificationType: NotificationTypeEnum.optional(),

		startDate: z.iso
			.datetime({ offset: true })
			.describe(
				'Date and time when the activity was last performed. Directly from patient statements. Mandatory',
			),

		endDate: z.iso
			.datetime({ offset: true })
			.optional()
			.describe(
				'Optional date and time when the activity should stop. Directly from patient statements.',
			),

		tone: NotificationToneEnum.optional(),

		channel: NotificationChannelEnum.optional(),

		characterLimit: z
			.number()
			.optional()
			.describe('Maximum character limit for the message. Example: 160'),

		goal: z
			.string()
			.optional()
			.describe(
				"The goal or call-to-action expected from the notification. Example: 'Confirm attendance'.",
			),

		priority: NotificationPriorityEnum.optional(),

		targetType: SchemaTargetType.describe(
			"Type of adherence target (e.g., 'medication', 'exercise').",
		),

		targetName: z
			.string()
			.describe("Name of the adherence target (e.g., 'Vitamin D')."),

		constraints: z
			.array(z.string())
			.optional()
			.describe(
				"Constraints for the message. Example: ['no emojis', 'no links']",
			),

		frequency: FrequencySchema.optional(),

		useFallback: z
			.boolean()
			.optional()
			.describe('Whether to generate a fallback message if data is missing.'),

		timezone: z
			.string()
			.optional()
			.describe("Patient's timezone in IANA format. Example: 'Africa/Accra'"),

		userId: z
			.string()
			.min(3)
			.max(50)
			.describe('Required User ID (3–50 characters)'),

		patient: z
			.string()
			.min(1, 'Patient ID is required')
			.describe(
				"ID of the patient (MongoDB ObjectId). Example: '678fa53f3a0ba70822aa3555'",
			),
	})
	.describe(
		'Schema for upserting a notification. All fields are optional except patient. Values are taken directly from patient statements.',
	);

export const NotificationFilterSchema = z
	.object({
		userId: z
			.string()
			.min(3)
			.max(50)
			.describe('Required User ID (3–50 characters)'),

		patient: z
			.string()
			.min(1, 'Patient ID is required')
			.describe(
				'ID of the patient (MongoDB ObjectId). Always required. ' +
					"Example: '678fa53f3a0ba70822aa3555'.",
			),

		notificationType: NotificationTypeEnum.describe(
			'Notification type used to identify an existing record. Keep past value if changed.',
		),

		goal: z
			.string()
			.describe(
				'The goal or call-to-action of the notification. Keep past value if updated.',
			),

		channel: NotificationChannelEnum.describe(
			'Delivery channel used to identify the notification. Keep past value if updated.',
		),
	})
	.describe(
		'Schema defining the unique identity of a notification for upsert operations. Used for lookup before creating a new notification.',
	);

export const NotificationUpsertRequestSchema = z.object({
	data: UpsertNotificationSchema.describe('New or updated notification data'),
	filters: NotificationFilterSchema.describe(
		'Identity fields used to find an existing notification before creating a new one',
	),
});

export const NotificationQuerySchema = createMongoQuerySchema(
	UpsertNotificationSchema,
);

export type NotificationUpsertRequestDto = z.infer<
	typeof NotificationUpsertRequestSchema
>;
export type UpsertNotificationDto = z.infer<typeof UpsertNotificationSchema>;
export type NotificationFilterDto = z.infer<typeof NotificationFilterSchema>;
export type NotificationQueryFilter = z.infer<typeof NotificationQuerySchema>;
