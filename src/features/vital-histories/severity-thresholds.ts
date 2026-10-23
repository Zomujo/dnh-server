import { createHash } from 'node:crypto';
import {
	CRITICAL_VITAL_SEVERITIES,
	VitalSeverityEnum,
} from './entities/vital-history.entity';

/**
 * The single source of the vital severity cutoffs: determineSeverity grades
 * readings with it and GET /client/severity-thresholds serves it, so the app
 * can grade offline readings the same way.
 *
 * Rules are checked in order and the first match wins. A rule matches when
 * any of its conditions holds; a rule without conditions always matches.
 */
export interface SeverityCondition {
	field: 'systolic' | 'diastolic' | 'value';
	gte?: number;
	lt?: number;
}

export interface SeverityRule {
	label: VitalSeverityEnum;
	any?: SeverityCondition[];
}

// Blood pressure in mmHg. AHA: Normal <120/<80, Elevated 120-129/<80,
// Stage 1 130-139/80-89 and Stage 2 >=140/>=90 (both folded into
// HYPERTENSIVE: this system needs "needs attention" vs "urgent", not the
// stage), Crisis >180/>120 (checked as >= to catch the boundary). AHA
// doesn't define hypotension; <90/<60 and a conservative <80/<50 "severe"
// cutoff are the commonly cited clinical thresholds.
const BLOOD_PRESSURE: SeverityRule[] = [
	{
		label: VitalSeverityEnum.HYPERTENSIVE_CRISIS,
		any: [
			{ field: 'systolic', gte: 180 },
			{ field: 'diastolic', gte: 120 },
		],
	},
	{
		label: VitalSeverityEnum.SEVERE_HYPOTENSION,
		any: [
			{ field: 'systolic', lt: 80 },
			{ field: 'diastolic', lt: 50 },
		],
	},
	{
		label: VitalSeverityEnum.HYPERTENSIVE,
		any: [
			{ field: 'systolic', gte: 130 },
			{ field: 'diastolic', gte: 80 },
		],
	},
	{
		label: VitalSeverityEnum.HYPOTENSIVE,
		any: [
			{ field: 'systolic', lt: 90 },
			{ field: 'diastolic', lt: 60 },
		],
	},
	{ label: VitalSeverityEnum.ELEVATED, any: [{ field: 'systolic', gte: 120 }] },
	{ label: VitalSeverityEnum.NORMAL },
];

// Blood sugar in mmol/L. ADA: Level 2 hypoglycemia <3.0, Level 1 3.0-<3.9,
// in-target 3.9-<7.3, elevated 7.3-<11.1 (11.1 / 200mg/dL is a common
// "significant hyperglycemia" marker), high 11.1-<13.9, critically high
// >=13.9 (250mg/dL, the DKA-risk threshold).
const BLOOD_SUGAR: SeverityRule[] = [
	{
		label: VitalSeverityEnum.CRITICALLY_LOW,
		any: [{ field: 'value', lt: 3.0 }],
	},
	{ label: VitalSeverityEnum.LOW, any: [{ field: 'value', lt: 3.9 }] },
	{ label: VitalSeverityEnum.NORMAL, any: [{ field: 'value', lt: 7.3 }] },
	{ label: VitalSeverityEnum.ELEVATED, any: [{ field: 'value', lt: 11.1 }] },
	{ label: VitalSeverityEnum.HIGH, any: [{ field: 'value', lt: 13.9 }] },
	{ label: VitalSeverityEnum.CRITICALLY_HIGH },
];

const RULES = {
	bloodPressure: { unit: 'mmHg', rules: BLOOD_PRESSURE },
	bloodSugar: { unit: 'mmol/L', rules: BLOOD_SUGAR },
};

export const SEVERITY_THRESHOLDS = {
	// Derived from the rules, so it changes whenever a cutoff does.
	version: createHash('sha256')
		.update(JSON.stringify({ RULES, CRITICAL_VITAL_SEVERITIES }))
		.digest('hex')
		.slice(0, 12),
	...RULES,
	// Labels that count as an emergency (urgent facility alert).
	critical: CRITICAL_VITAL_SEVERITIES,
	// Any other vital type, or a value that can't be parsed.
	default: VitalSeverityEnum.NORMAL,
};

function matches(
	condition: SeverityCondition,
	reading: Record<string, number>,
) {
	const value = reading[condition.field];
	if (condition.gte !== undefined && !(value >= condition.gte)) return false;
	if (condition.lt !== undefined && !(value < condition.lt)) return false;
	return true;
}

function grade(rules: SeverityRule[], reading: Record<string, number>) {
	const rule = rules.find(
		(r) => !r.any || r.any.some((c) => matches(c, reading)),
	);
	return rule?.label ?? SEVERITY_THRESHOLDS.default;
}

export function determineSeverity(
	vitalType: string,
	value: string,
): VitalSeverityEnum {
	if (vitalType === 'bloodPressure') {
		const parts = value.split('/');
		if (parts.length !== 2) return SEVERITY_THRESHOLDS.default;
		const systolic = Number.parseFloat(parts[0]);
		const diastolic = Number.parseFloat(parts[1]);
		if (Number.isNaN(systolic) || Number.isNaN(diastolic)) {
			return SEVERITY_THRESHOLDS.default;
		}
		return grade(BLOOD_PRESSURE, { systolic, diastolic });
	}

	if (vitalType === 'bloodSugar') {
		const val = Number.parseFloat(value);
		if (Number.isNaN(val)) return SEVERITY_THRESHOLDS.default;
		return grade(BLOOD_SUGAR, { value: val });
	}

	return SEVERITY_THRESHOLDS.default;
}
