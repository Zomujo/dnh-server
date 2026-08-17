/**
 * Escapes regex metacharacters so a user-supplied string can be safely used
 * inside `new RegExp()` as a literal substring match rather than a compiled
 * pattern (anchors, wildcards, etc).
 */
export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Derives the set of fields a caller is allowed to run a search regex
 * against from the same projection they already pass to `.select()` —
 * one source of truth, so a field excluded from the response can't be
 * probed via search either.
 *
 * Mongoose select projections are either pure-inclusion ("name age") or
 * pure-exclusion ("-password -qdrantId") — never mixed (aside from _id).
 * For an exclusion projection we can only return a safe allowlist if the
 * full field set is supplied via `allFields`; without it we deny all
 * custom search fields rather than misreading "-password" as permission
 * to search the "password" field.
 */
export function resolveSearchableFields(
	select: string | string[] | undefined,
	allFields?: string[],
): string[] {
	if (!select) return [];

	const tokens = Array.isArray(select) ? select : select.trim().split(/\s+/);
	const meaningfulTokens = tokens.filter(
		(token) => token && token !== '_id' && token !== '-_id',
	);
	if (!meaningfulTokens.length) return [];

	const isExclusion = meaningfulTokens.some((token) => token.startsWith('-'));

	if (!isExclusion) {
		return meaningfulTokens.map((token) => token.replace(/^\+/, ''));
	}

	if (!allFields?.length) return [];

	const excluded = new Set(
		meaningfulTokens.map((token) => token.replace(/^-/, '')),
	);
	return allFields.filter((field) => !excluded.has(field));
}
