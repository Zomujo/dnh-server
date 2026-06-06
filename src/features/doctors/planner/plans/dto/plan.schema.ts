import { z } from 'zod';
import { createMongoQuerySchema } from '@/features/client/ai/agents/requiem/state';

export const PlanUpsertSchema = z.object({
	personnel: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Personnel ID (MongoDB ObjectId) who created this plan'),

	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Patient ID (MongoDB ObjectId) associated with this plan'),

	plannerSession: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Planner Session ID (MongoDB ObjectId) this plan belongs to'),

	treatmentGoal: z
		.string()
		.describe('Primary objective of the chronic care treatment plan'),

	medications: z
		.string()
		.describe('List of medications prescribed or recommended for the patient')
		.nullable()
		.optional(),

	lifestyleAdvice: z
		.string()
		.describe('Dietary, exercise, or habit changes recommended for the patient')
		.nullable()
		.optional(),

	otherTherapies: z
		.string()
		.describe('Supplementary treatments or therapies for the patient')
		.nullable()
		.optional(),

	monitoring: z
		.string()
		.describe('Required follow-up measurements or checks for the patient')
		.nullable()
		.optional(),

	nextAppointmentAt: z.iso
		.datetime({ offset: true })
		.pipe(z.coerce.date())
		.describe('Date and time of the next scheduled appointment')
		.nullable()
		.optional(),
});

export const PlanIdentitySchema = z.object({
	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Patient ID (MongoDB ObjectId) used to identify the plan'),

	plannerSession: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe(
			'Planner Session ID (MongoDB ObjectId) used to identify the plan',
		),
});

export const PlanAISchema = z.object({
	filters: PlanIdentitySchema.describe(
		'Identity filters with past values. Used to locate the existing plan.',
	),
	data: PlanUpsertSchema.describe(
		'New data with present values. Used to create or update the plan.',
	),
});

export const PlanQuerySchema = createMongoQuerySchema(PlanUpsertSchema);

// Types
export type PlanInput = z.infer<typeof PlanAISchema>;
export type PlanUpsertInput = z.infer<typeof PlanUpsertSchema>;
export type PlanIdentity = z.infer<typeof PlanIdentitySchema>;
export type PlanQueryFilter = z.infer<typeof PlanQuerySchema>;
