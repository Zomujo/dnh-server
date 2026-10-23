import { resolveCorsOrigins, resolveTrustProxy } from './network.helper';

describe('resolveCorsOrigins', () => {
	it('allows any origin when unset or blank', () => {
		expect(resolveCorsOrigins(undefined)).toBe(true);
		expect(resolveCorsOrigins(' , ')).toBe(true);
	});

	it('splits and trims a comma-separated list', () => {
		expect(
			resolveCorsOrigins('https://hcp.example.org, http://localhost:3000'),
		).toEqual(['https://hcp.example.org', 'http://localhost:3000']);
	});
});

describe('resolveTrustProxy', () => {
	it('defaults to one hop', () => {
		expect(resolveTrustProxy(undefined)).toBe(1);
		expect(resolveTrustProxy('')).toBe(1);
	});

	it('parses booleans and hop counts', () => {
		expect(resolveTrustProxy('true')).toBe(true);
		expect(resolveTrustProxy('false')).toBe(false);
		expect(resolveTrustProxy('2')).toBe(2);
	});

	it('passes subnet lists through for Express', () => {
		expect(resolveTrustProxy('loopback, 10.0.0.0/8')).toBe(
			'loopback, 10.0.0.0/8',
		);
	});
});
