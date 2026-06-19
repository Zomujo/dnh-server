import { z } from 'zod';
import {
	createMongoQuerySchema,
	mongoOperator,
} from '@/features/client/ai/agents/requiem/state';

export const VitalSeverityEnum = z.enum(['normal', 'elevated', 'critical']);
export const VitalTypeEnum = z.enum([
	'bloodPressure',
	'heartRate',
	'temperature',
	'respirationRate',
	'oxygenSaturation',
	'weight',
	'bloodSugar',
]);

export const BloodSugarSubTypeEnum = z.enum([
	'randomBloodSugar',
	'fastingBloodSugar',
	'oralGlucoseTt',
	'postPrandial',
]);

export const VitalSubTypeEnum = z.union([
	BloodSugarSubTypeEnum,
	z.enum(['systolic', 'diastolic']),
]);

export const VitalHistoryUpsertSchema = z.object({
	userId: z
		.string()
		.min(3)
		.max(50)
		.describe(
			"User ID associated with the vital history. Example: 'user_12345'",
		),

	patient: z
		.string()
		.regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId')
		.describe(
			"Patient ID (MongoDB ObjectId). Example: '664b7f8e2c2a1e4b8f1d2c3a4'",
		),

	vitalType: VitalTypeEnum.describe(
		"Type of vital sign being recorded. Example: 'bloodPressure'",
	),

	vitalSubType: BloodSugarSubTypeEnum.optional().describe(
		"Subtype of vital sign. Example: If vitalType is bloodGlucose then 'randomBloodSugar', 'fastingBloodSugar', 'oralGlucoseTt', 'postPrandial'. oralGlucoseTt if drink was taken at the hospital. postPrandial if taken after a meal.",
	),

	value: z
		.string()
		.min(1, 'Value must not be empty')
		.max(50, 'Value cannot exceed 50 characters')
		.describe(
			"Measured value of the vital sign. Example: '120/80'. If vital sign is weight convert to kg",
		),

	unit: z
		.string()
		.min(1, 'Unit must not be empty')
		.max(20, 'Unit cannot exceed 20 characters')
		.describe(
			"Unit of measurement for the vital sign. Example: 'mmHg'. If weight, convert to kg. If blood sugar, convert to mmol/L unless already stated as such.",
		),

	// severity: VitalSeverityEnum.optional().describe(
	// 	'AI-determined severity of the vital sign based on the value and vital type. ' +
	// 		'Do not take user input directly; infer severity automatically.',
	// ),

	reasoning: z
		.string()
		.min(1)
		.max(200)
		.optional()
		.describe(
			'AI-generated reasoning or interpretation of the vital sign value. ' +
				"Example: 'Blood pressure is within the normal range for an adult.'",
		),

	recordedAt: z.iso
		.datetime({ offset: true })
		.pipe(z.coerce.date())
		.describe(
			"ISO date-time when the vital was recorded. Example: '2024-06-01T10:30:00.000Z'",
		),

	notes: z
		.string()
		.max(500)
		.optional()
		.describe(
			'AI-generated additional notes about the measurement context. ' +
				"Example: 'Patient was resting during measurement.'",
		),
});

export const VitalHistoryIdentitySchema = z.object({
	userId: z
		.string()
		.min(3)
		.max(50)
		.describe(
			"User ID associated with the vital history. Example: 'user_12345'",
		),

	patient: z
		.string()
		.regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId')
		.describe(
			"Patient ID (MongoDB ObjectId). Example: '664b7f8e2c2a1e4b8f1d2c3a4'",
		),

	vitalType: VitalTypeEnum.describe(
		"Type of vital sign being recorded. Example: 'bloodPressure'",
	),

	value: z
		.string()
		.min(1, 'Value must not be empty')
		.max(50, 'Value cannot exceed 50 characters')
		.describe("Measured value of the vital sign. Example: '120/80'"),
});

export const VitalHistoryAISchema = z.object({
	filters: VitalHistoryIdentitySchema.describe(
		'Identity filters with past values. Used to locate the existing vital history.',
	),
	data: VitalHistoryUpsertSchema.describe(
		'New data with present values. Used to create or update the vital history.',
	),
});

export const VitalHistoryFilterSchema = z
	.object({
		userId: mongoOperator(z.string().min(3).max(50)).optional(),
		patient: mongoOperator(z.string().regex(/^[a-f\d]{24}$/i)).optional(),
		vitalType: mongoOperator(VitalTypeEnum).optional(),
		vitalSubType: mongoOperator(VitalSubTypeEnum).optional(),
		value: mongoOperator(z.string().min(1).max(50)).optional(),
		unit: mongoOperator(z.string().min(1).max(20)).optional(),
		severity: mongoOperator(VitalSeverityEnum).optional(),
		reasoning: mongoOperator(z.string().min(1).max(200)).optional(),
		recordedAt: mongoOperator(z.iso.datetime({ offset: true })).optional(),
		notes: mongoOperator(z.string().max(500)).optional(),
	})
	.strict();

export const VitalHistoryQuerySchema = createMongoQuerySchema(
	VitalHistoryUpsertSchema.partial(),
);

// ---------- Types ----------
export type VitalHistoryInput = z.infer<typeof VitalHistoryAISchema>;
export type VitalHistoryUpsertInput = z.infer<typeof VitalHistoryUpsertSchema>;
export type VitalHistoryIdentity = z.infer<typeof VitalHistoryIdentitySchema>;
export type VitalHistoryQueryFilter = z.infer<typeof VitalHistoryQuerySchema>;
