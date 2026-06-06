import { z } from 'zod';
import { createMongoQuerySchema } from '@/features/client/ai/agents/requiem/state';

export const SeverityEnum = z.enum(['mild', 'moderate', 'severe']);
export const CurrentStatusEnum = z.enum([
	'active',
	'managed',
	'resolved',
	'in_remission',
]);

const DiagnosedByEnum = z
	.enum(['doctor', 'therapist'])
	.describe("Indicates who made the diagnosis. Example: 'doctor'.");

export const ChronicConditionUpsertSchema = z.object({
	userId: z
		.string()
		.min(3)
		.max(50)
		.describe(
			'User ID associated with the chronic condition (3–50 characters)',
		),

	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Patient ID (MongoDB ObjectId) associated with this condition'),

	conditionName: z
		.string()
		.min(2)
		.max(100)
		.describe(
			'Name of the chronic condition (2–100 characters, e.g., Diabetes Mellitus)',
		)
		.optional(),

	severity: SeverityEnum.describe(
		'Severity of the condition: mild, moderate, or severe',
	).optional(),

	diagnosedBy: DiagnosedByEnum.describe(
		"Indicates who made the diagnosis (doctor, pharmacist, AI, etc.). Example: 'doctor'.",
	),

	diagnosedDate: z
		.object({
			day: z
				.number()
				.int()
				.min(1)
				.max(31)
				.optional()
				.describe('Day of month (1–31)'),
			month: z
				.number()
				.int()
				.min(1)
				.max(12)
				.optional()
				.describe('Month number (1–12)'),
			year: z.number().int().min(1).describe('Four-digit year'),
		})
		.describe(
			'Date when the condition was diagnosed. Year required. Month optional. Day only allowed if month is present.',
		)
		.optional(),

	currentStatus: CurrentStatusEnum.describe(
		'Current status of the condition: active, managed, resolved, or in_remission',
	).optional(),

	notes: z
		.string()
		.max(500)
		.describe(
			'AI-generated additional notes about the condition (up to 500 characters)',
		)
		.optional(),
});

export const ChronicConditionIdentitySchema = z.object({
	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe(
			'Patient ID (MongoDB ObjectId) to uniquely identify the condition',
		),

	userId: z
		.string()
		.min(3)
		.max(50)
		.describe(
			'User ID associated with the chronic condition (3–50 characters)',
		),

	conditionName: z
		.string()
		.min(2)
		.max(100)
		.describe(
			'Name of the chronic condition (e.g., Diabetes Mellitus) used to locate the record',
		),
});

export const ChronicConditionAISchema = z.object({
	filters: ChronicConditionIdentitySchema.describe(
		'Identity filters with past values. Used to locate the existing chronic condition.',
	),
	data: ChronicConditionUpsertSchema.describe(
		'New data with present values. Used to create or update a chronic condition.',
	),
});

export const ChronicConditionQuerySchema = createMongoQuerySchema(
	ChronicConditionUpsertSchema,
);

// Types
export type ChronicConditionInput = z.infer<typeof ChronicConditionAISchema>;
export type ChronicConditionUpsertInput = z.infer<
	typeof ChronicConditionUpsertSchema
>;
export type ChronicConditionIdentity = z.infer<
	typeof ChronicConditionIdentitySchema
>;
export type ChronicConditionQueryFilter = z.infer<
	typeof ChronicConditionQuerySchema
>;
