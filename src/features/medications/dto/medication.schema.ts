import { z } from 'zod';
import { createMongoQuerySchema } from '@/features/client/ai/agents/requiem/state';

export const MedicationUpsertSchema = z.object({
	userId: z
		.string()
		.min(3)
		.max(50)
		.describe('User ID associated with the medication (3–50 characters)'),

	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Patient ID (MongoDB ObjectId) associated with this medication'),

	name: z
		.string()
		.min(2)
		.max(100)
		.describe('Name of the medication (e.g., Metformin)')
		.optional(),

	quantity: z.number().describe('Quantity prescribed (numeric)').optional(),

	refillReminder: z
		.number()
		.describe('At what quantity should a refill reminder be sent')
		.optional(),

	quantityUnit: z
		.string()
		.min(2)
		.max(20)
		.describe('Unit of quantity (e.g., tablets, ml, capsules)')
		.optional(),

	dosage: z
		.string()
		.min(1)
		.max(50)
		.describe('Dosage information (e.g., 500mg)')
		.optional(),

	frequency: z
		.string()
		.min(2)
		.max(50)
		.describe('Frequency of administration (e.g., twice daily)')
		.optional(),

	route: z
		.string()
		.min(2)
		.max(30)
		.describe('Route of administration (e.g., oral, injection)')
		.optional(),

	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format')
		.describe('Start date of medication (YYYY-MM-DD)')
		.optional(),

	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format')
		.describe('End date of medication (YYYY-MM-DD, optional)')
		.optional(),

	prescribedBy: z
		.string()
		.min(2)
		.max(100)
		.describe('Prescriber name (2–100 characters, e.g., Dr. Smith)')
		.optional(),

	purpose: z
		.string()
		.min(2)
		.max(100)
		.describe('Purpose of the medication (e.g., Blood pressure control)')
		.optional(),

	sideEffects: z
		.array(z.string().min(1))
		.describe(
			"Possible side effects (array of strings, e.g., ['Nausea', 'Headache'])",
		)
		.optional(),
});

export const MedicationIdentitySchema = z.object({
	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Patient ID (MongoDB ObjectId) used to identify the medication'),

	userId: z
		.string()
		.min(3)
		.max(50)
		.describe('User ID associated with the medication (3–50 characters)'),

	name: z
		.string()
		.min(2)
		.max(100)
		.describe(
			"Medication name used to identify the record (e.g., Metformin). Repeat it's name exactly as it was seen previously",
		),
});

export const MedicationAISchema = z.object({
	filters: MedicationIdentitySchema.describe(
		'Identity filters with past values. Used to locate the existing medication.',
	),
	data: MedicationUpsertSchema.describe(
		'New data with present values. Used to create or update the medication.',
	),
});

export const MedicationQuerySchema = createMongoQuerySchema(
	MedicationUpsertSchema,
);

// Types
export type MedicationInput = z.infer<typeof MedicationAISchema>;
export type MedicationUpsertInput = z.infer<typeof MedicationUpsertSchema>;
export type MedicationIdentity = z.infer<typeof MedicationIdentitySchema>;
export type MedicationQueryFilter = z.infer<typeof MedicationQuerySchema>;
