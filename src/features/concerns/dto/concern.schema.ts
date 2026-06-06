import { z } from 'zod';
import { createMongoQuerySchema } from '@/features/client/ai/agents/requiem/state';

export const ConcernTypeEnum = z.enum([
	'symptoms',
	'sideEffect',
	'mentalHealth',
	'general',
	'other',
]);

export const ConcernSeverityEnum = z.enum(['mild', 'moderate', 'severe']);

export const ConcernUpsertSchema = z.object({
	userId: z
		.string()
		.min(3)
		.max(50)
		.describe('User ID who raised the concern (3–50 characters)'),

	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Patient ID (MongoDB ObjectId) associated with this concern'),

	concernType: ConcernTypeEnum.describe(
		'Type of concern: symptom, side_effect, mental_health, general, or other',
	).optional(),

	description: z
		.array(z.string().min(1))
		.min(1)
		.describe(
			"Descriptions of the concern (at least one, e.g., ['Headache', 'Nausea'])",
		)
		.optional(),

	severity: ConcernSeverityEnum.describe(
		'Severity of the concern: mild, moderate, or severe',
	),

	onsetDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format')
		.describe('Date when the concern started (YYYY-MM-DD)')
		.optional(),

	resolved: z
		.boolean()
		.describe('Whether the concern has been resolved (true/false)')
		.optional(),

	notes: z
		.string()
		.max(500)
		.describe(
			'AI-generated supportive suggestions or guidance. ' +
				'Not medical instructions, but gentle recommendations or next steps inferred from context.',
		)
		.optional(),
});

export const ConcernIdentitySchema = z.object({
	userId: z
		.string()
		.min(3)
		.max(50)
		.describe('User ID who raised the concern (3–50 characters)'),

	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Patient ID (MongoDB ObjectId) used to identify the concern'),

	concernType: ConcernTypeEnum.describe(
		'Type of concern used to narrow down the specific concern (symptom, side_effect, mental_health, general, or other)',
	),
});

export const ConcernAISchema = z.object({
	filters: ConcernIdentitySchema.describe(
		'Identity filters with past values. Used to locate the existing concern.',
	),
	data: ConcernUpsertSchema.describe(
		'New data with present values. Used to create or update the concern.',
	),
});

export const ConcernQuerySchema = createMongoQuerySchema(ConcernUpsertSchema);

// Types
export type ConcernInput = z.infer<typeof ConcernAISchema>;
export type ConcernUpsertInput = z.infer<typeof ConcernUpsertSchema>;
export type ConcernIdentity = z.infer<typeof ConcernIdentitySchema>;
export type ConcernQueryFilter = z.infer<typeof ConcernQuerySchema>;
