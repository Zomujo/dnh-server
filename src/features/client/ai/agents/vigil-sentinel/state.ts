import { z } from 'zod';

export const VigilSentinelAlertFiltersSchema = z.object({
	userId: z
		.string()
		.min(3)
		.max(50)
		.describe('User ID of the patient this alert concerns'),

	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Patient ID (MongoDB ObjectId) this alert concerns'),
});

export const VigilSentinelAlertDataSchema = z.object({
	summary: z
		.string()
		.min(1)
		.max(500)
		.describe(
			'A brief, clinically clear summary of the possible medical risk detected in the conversation, written for a clinician to read quickly. Example: "Patient reports sudden chest pain and difficulty speaking, started 10 minutes ago."',
		),
});

export const VigilSentinelAlertSchema = z.object({
	filters: VigilSentinelAlertFiltersSchema.describe(
		'Identity of the patient this alert concerns — always the authenticated caller, never inferred from conversation text.',
	),
	data: VigilSentinelAlertDataSchema,
});

export type VigilSentinelAlertInput = z.infer<typeof VigilSentinelAlertSchema>;
