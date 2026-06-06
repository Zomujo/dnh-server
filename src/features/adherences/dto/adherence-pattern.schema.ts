import { z } from 'zod';
import { createMongoQuerySchema } from '@/features/client/ai/agents/requiem/state';

export const PatternSchemaTargetType = z.enum([
	'medication',
	'exercise',
	'diet',
	'vitals',
	'appointment',
	'other',
]);

export const AdherencePatternUpsertSchema = z.object({
	userId: z
		.string()
		.min(3)
		.max(50)
		.describe(
			'User ID associated with the adherence pattern (3–50 characters)',
		),

	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Patient ID (MongoDB ObjectId) associated with this pattern'),

	targetType: PatternSchemaTargetType.describe(
		'Type of target: medication, lifestyle, or therapy',
	).optional(),

	targetName: z
		.string()
		.min(2)
		.max(100)
		.describe('Name of the target (e.g., medication name, lifestyle habit)')
		.optional(),

	adherenceRate: z
		.number()
		.min(0)
		.max(100)
		.describe('Adherence rate as a percentage (0–100)'),

	lastLoggedAt: z.iso
		.datetime({ offset: true })
		.describe('Date and time when adherence was last logged (ISO string)'),

	notes: z
		.string()
		.max(500)
		.describe(
			'AI-generated additional notes about the adherence pattern (optional, up to 500 characters)',
		)
		.optional(),
});

export const AdherencePatternIdentitySchema = z.object({
	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Patient ID (MongoDB ObjectId) to uniquely identify the pattern'),

	userId: z
		.string()
		.min(3)
		.max(50)
		.describe(
			'User ID associated with the adherence pattern (3–50 characters)',
		),

	targetType: PatternSchemaTargetType.describe(
		'Type of target: medication, lifestyle, or therapy',
	),

	targetName: z
		.string()
		.min(2)
		.max(100)
		.describe('Name of the target (e.g., medication name, lifestyle habit)'),
});

export const AdherencePatternAISchema = z.object({
	filters: AdherencePatternIdentitySchema.describe(
		'Identity filters with past values. Used to locate the existing adherence pattern.',
	),
	data: AdherencePatternUpsertSchema.describe(
		'New data with present values. Used to create or update an adherence pattern.',
	),
});

export type AdherencePatternInput = z.infer<typeof AdherencePatternAISchema>;
export type AdherencePatternUpsertInput = z.infer<
	typeof AdherencePatternUpsertSchema
>;

export type AdherencePatternIdentity = z.infer<
	typeof AdherencePatternIdentitySchema
>;

export const AdherencePatternQuerySchema = createMongoQuerySchema(
	AdherencePatternUpsertSchema,
);
export type AdherencePatternQueryFilter = z.infer<
	typeof AdherencePatternQuerySchema
>;
