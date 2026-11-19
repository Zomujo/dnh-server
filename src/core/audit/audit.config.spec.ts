import {
	DEFAULT_AUDIT_LOG_TTL_DAYS,
	resolveAuditTtlDays,
	ttlDaysToSeconds,
} from './audit.config';

describe('resolveAuditTtlDays', () => {
	it('defaults to 730 days when unset or blank', () => {
		expect(DEFAULT_AUDIT_LOG_TTL_DAYS).toBe(730);
		expect(resolveAuditTtlDays(undefined)).toBe(730);
		expect(resolveAuditTtlDays('')).toBe(730);
		expect(resolveAuditTtlDays('  ')).toBe(730);
	});

	it('parses a whole number of days', () => {
		expect(resolveAuditTtlDays('365')).toBe(365);
		expect(resolveAuditTtlDays(' 90 ')).toBe(90);
	});

	it('falls back to the default for invalid values', () => {
		for (const raw of ['0', '-5', '1.5', 'abc', '2y', '36501']) {
			expect(resolveAuditTtlDays(raw)).toBe(730);
		}
	});

	it('converts days to seconds for expireAfterSeconds', () => {
		expect(ttlDaysToSeconds(1)).toBe(86_400);
		expect(ttlDaysToSeconds(730)).toBe(63_072_000);
	});
});
