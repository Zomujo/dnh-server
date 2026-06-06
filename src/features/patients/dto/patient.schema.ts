import { z } from 'zod';
import { createMongoQuerySchema } from '@/features/client/ai/agents/requiem/state';

export const GenderEnum = z.enum(['male', 'female', 'other']);
export const SmokingStatusEnum = z.enum(['current', 'former', 'never']);
export const AlcoholUseEnum = z.enum(['yes', 'no', 'occasional']);
export const PregnancyStatusEnum = z.enum([
	'pregnant',
	'not_pregnant',
	'unknown',
]);

export const PatientUpsertSchema = z.object({
	userId: z
		.string()
		.min(1)
		.describe('The ID of the user associated with the patient'),

	name: z.string().min(1).describe('Full name of the patient').optional(),

	phoneNumber: z
		.string()
		.regex(
			/^\+[1-9]\d{1,14}$/,
			'Phone number must be in E.164 format, e.g., +233541234567',
		)
		.describe(
			"Patient's phone number in strict international E.164 format. Must start with '+' followed by country code and digits (max 15). Example: '+233541234567'.",
		)
		.optional(),

	dateOfBirth: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format')
		.describe('Date of birth of the patient in YYYY-MM-DD format')
		.optional(),

	gender: GenderEnum.describe(
		'Gender of the patient: male, female, or other',
	).optional(),

	height: z
		.number()
		.min(30)
		.describe('Height of the patient in centimeters (min 30)')
		.optional(),

	bloodType: z
		.string()
		.describe('Blood type of the patient (e.g., O+)')
		.optional(),

	allergies: z
		.array(z.string())
		.describe('List of allergies (array of strings)')
		.optional(),

	primaryPhysician: z.string().describe('Primary physician name').optional(),

	emergencyContactName: z
		.string()
		.describe('Emergency contact full name')
		.optional(),

	emergencyContactPhone: z
		.string()
		.regex(/^\+?[1-9]\d{1,14}$/, 'Must be a valid phone number')
		.describe(
			'Emergency contact phone number (E.164 format, e.g., +233541234567)',
		)
		.optional(),

	smokingStatus: SmokingStatusEnum.describe(
		'Smoking status of the patient: current, former, never',
	).optional(),

	alcoholUse: AlcoholUseEnum.describe(
		'Alcohol use status of the patient: yes, no, occasional',
	).optional(),

	pregnancyStatus: PregnancyStatusEnum.describe(
		'Pregnancy status: pregnant, not_pregnant, unknown',
	).optional(),

	notes: z
		.string()
		.max(500)
		.describe('AI-generated notes about the patient (up to 500 characters)')
		.optional(),
});

// Identity schema: what uniquely identifies a patient
export const PatientIdentitySchema = z.object({
	userId: z
		.string()
		.min(1)
		.describe('The ID of the user associated with the patient'),
	// You could also add patientId if that exists in your system
	// patientId: z.string().uuid().describe('Unique ID of the patient').optional(),
});

// Upsert schema: combines identity + data
export const PatientAISchema = z.object({
	filters: PatientIdentitySchema.describe(
		'Identity filters with past values. Used to locate the existing patient.',
	),
	data: PatientUpsertSchema.describe(
		'New data with present values. Used to create or update the patient.',
	),
});

export const PatientQuerySchema = createMongoQuerySchema(PatientUpsertSchema);

export type PatientInput = z.infer<typeof PatientAISchema>;
export type PatientUpsertInput = z.infer<typeof PatientUpsertSchema>;
export type PatientIdentity = z.infer<typeof PatientIdentitySchema>;
export type PatientQueryFilter = z.infer<typeof PatientQuerySchema>;
