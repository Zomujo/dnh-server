import { NodeEnvs } from '../../enums';

/**
 * Whether unknown request fields are rejected with a 400 instead of being
 * silently stripped. `FORBID_UNKNOWN_FIELDS=true|false` decides; unset, it is
 * on for staging only, so client/server mismatches surface during testing
 * without risking production traffic.
 */
export function resolveForbidUnknownFields(
	environment: string | undefined = process.env.NODE_ENV,
	raw: string | undefined = process.env.FORBID_UNKNOWN_FIELDS,
): boolean {
	const value = raw?.trim().toLowerCase();
	if (value === 'true') return true;
	if (value === 'false') return false;
	return environment === NodeEnvs.STAGING;
}
