import { z } from 'zod';
import { createMongoQuerySchema } from '@/features/client/ai/agents/requiem/state';

export const SchemaTargetType = z
	.enum(['medication', 'exercise', 'diet', 'vitals', 'appointment', 'other'])
	.describe(
		"Type of adherence target. Example: 'medication', 'exercise'. " +
			'! In `filters`, keep the past value if changed in the present so the system can correctly identify the log.',
	);

export const SchemaStatus = z
	.enum(['taken', 'missed', 'partial'])
	.describe(
		"AI inferred Status of adherence. Example: 'taken'." +
			'! In `filters`, use the past status if it was updated in the present.',
	);

export const AdherenceLogIdentitySchema = z.object({
	userId: z
		.string()
		.describe(
			'ID of the user logging adherence. Optional and may be undefined.',
		),

	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe(
			'Patient ObjectId (patientId in request). Always required in filters. ' +
				'! This should reflect the past patientId if changed in the present.',
		),

	targetType: SchemaTargetType.describe(
		"Type of adherence target (e.g., 'medication', 'exercise'). " +
			'! Use the past value if changed in the present.',
	),

	targetName: z
		.string()
		.describe(
			"Name of the adherence target (e.g., 'Vitamin D'). " +
				'! Use the past name here if the user updated it in the present.',
		),

	takenAt: z.iso
		.datetime({ offset: true })
		.describe(
			'The datetime when the target was originally logged (ISO format). ' +
				'! Use the past datetime if the present one was changed, so the system can find the correct record.',
		),
});

export const AdherenceLogUpsertSchema = z.object({
	userId: z
		.string()
		.describe(
			'ID of the user logging adherence. Optional and may be undefined.',
		),

	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe(
			'Patient ObjectId (patientId in request). Optional here to avoid overwriting identity filters.',
		),

	targetType: SchemaTargetType.describe(
		"Type of adherence target (e.g., 'medication', 'exercise').",
	),

	targetName: z
		.string()
		.describe('Name of the adherence target (e.g., medication name).'),

	taken: z.boolean().describe('Whether the target was taken/adhered to.'),

	takenAt: z.iso
		.datetime({ offset: true })
		.optional()
		.describe(
			"Datetime when the target was taken (ISO format). Example: '2025-09-19T08:30:00Z'.",
		),

	status: SchemaStatus,

	notes: z
		.string()
		.optional()
		.describe('AI-generated additional notes about adherence.'),
});

export const AdherenceLogAISchema = z.object({
	filters: AdherenceLogIdentitySchema.describe(
		'Schema defining the unique identity of an adherence log. ' +
			'These fields (patient, targetType, targetName, takenAt) are used to locate an existing record before applying updates.',
	),
	data: AdherenceLogUpsertSchema.describe(
		'Schema for creating or updating an adherence log. Contains the present values to apply after locating the record with `filters`.',
	),
});

export const AdherenceLogQuerySchema = createMongoQuerySchema(
	AdherenceLogUpsertSchema,
);

// ==================== TYPES ====================
export type AdherenceLogInput = z.infer<typeof AdherenceLogAISchema>;
export type AdherenceLogUpsertInput = z.infer<typeof AdherenceLogUpsertSchema>;
export type AdherenceLogIdentity = z.infer<typeof AdherenceLogIdentitySchema>;
export type AdherenceLogQueryFilter = z.infer<typeof AdherenceLogQuerySchema>;
