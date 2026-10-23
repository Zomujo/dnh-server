import { VitalSeverityEnum as S } from './entities/vital-history.entity';
import { determineSeverity, SEVERITY_THRESHOLDS } from './severity-thresholds';

describe('severity thresholds', () => {
	it.each([
		['180/90', S.HYPERTENSIVE_CRISIS],
		['150/120', S.HYPERTENSIVE_CRISIS],
		['79/70', S.SEVERE_HYPOTENSION],
		['100/49', S.SEVERE_HYPOTENSION],
		['130/70', S.HYPERTENSIVE],
		['110/80', S.HYPERTENSIVE],
		['89/70', S.HYPOTENSIVE],
		['100/59', S.HYPOTENSIVE],
		['120/79', S.ELEVATED],
		['119/79', S.NORMAL],
		// First match wins: a high systolic with a very low diastolic is a crisis.
		['185/45', S.HYPERTENSIVE_CRISIS],
	])('grades blood pressure %s as %s', (value, expected) => {
		expect(determineSeverity('bloodPressure', value)).toBe(expected);
	});

	it.each([
		['2.9', S.CRITICALLY_LOW],
		['3.0', S.LOW],
		['3.9', S.NORMAL],
		['7.29', S.NORMAL],
		['7.3', S.ELEVATED],
		['11.1', S.HIGH],
		['13.9', S.CRITICALLY_HIGH],
	])('grades blood sugar %s as %s', (value, expected) => {
		expect(determineSeverity('bloodSugar', value)).toBe(expected);
	});

	it.each([
		['bloodPressure', '120'],
		['bloodPressure', 'abc/80'],
		['bloodSugar', 'high'],
		['heartRate', '220'],
	])('falls back to the default for %s %s', (type, value) => {
		expect(determineSeverity(type, value)).toBe(SEVERITY_THRESHOLDS.default);
	});

	it('serves a stable version and ends every rule list with a catch-all', () => {
		expect(SEVERITY_THRESHOLDS.version).toMatch(/^[0-9a-f]{12}$/);
		for (const set of [
			SEVERITY_THRESHOLDS.bloodPressure,
			SEVERITY_THRESHOLDS.bloodSugar,
		]) {
			expect(set.rules.at(-1)?.any).toBeUndefined();
		}
		expect(SEVERITY_THRESHOLDS.critical).toContain(S.HYPERTENSIVE_CRISIS);
	});
});
