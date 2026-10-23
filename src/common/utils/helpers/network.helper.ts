/**
 * Allowed browser origins from `CORS_ORIGINS` (comma-separated). `true`
 * (reflect any origin, the historical behaviour) when it is unset, so a
 * deploy that hasn't configured it yet keeps working — main.ts warns.
 */
export function resolveCorsOrigins(
	raw: string | undefined = process.env.CORS_ORIGINS,
): string[] | true {
	const origins = (raw ?? '')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);
	return origins.length > 0 ? origins : true;
}

/**
 * Express `trust proxy` value from `TRUST_PROXY`. Defaults to 1 hop (the
 * Railway edge), so `req.ip` is the real client rather than the proxy and
 * per-IP rate limits stop lumping every user together. Accepts a hop
 * count, `true`/`false`, or an Express subnet list ("loopback, 10.0.0.0/8").
 */
export function resolveTrustProxy(
	raw: string | undefined = process.env.TRUST_PROXY,
): number | boolean | string {
	const value = raw?.trim();
	if (!value) return 1;
	if (value === 'true') return true;
	if (value === 'false') return false;
	const hops = Number(value);
	return Number.isInteger(hops) && hops >= 0 ? hops : value;
}
