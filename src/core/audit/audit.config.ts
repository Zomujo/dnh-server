export const DEFAULT_AUDIT_LOG_TTL_DAYS = 730;
/** Upper bound so a typo can't overflow Mongo's expireAfterSeconds. */
const MAX_AUDIT_LOG_TTL_DAYS = 36_500;

/**
 * Parses AUDIT_LOG_TTL_DAYS: a whole number of days between 1 and 36500.
 * Unset, blank or invalid values fall back to the default (730 days).
 */
export function resolveAuditTtlDays(raw: string | undefined): number {
	const value = raw?.trim();
	if (!value || !/^\d+$/.test(value)) return DEFAULT_AUDIT_LOG_TTL_DAYS;
	const days = Number(value);
	if (days < 1 || days > MAX_AUDIT_LOG_TTL_DAYS) {
		return DEFAULT_AUDIT_LOG_TTL_DAYS;
	}
	return days;
}

export function ttlDaysToSeconds(days: number): number {
	return days * 24 * 60 * 60;
}
