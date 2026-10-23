import { resolveForbidUnknownFields } from './validation.helper';

describe('resolveForbidUnknownFields', () => {
	it('is on for staging by default', () => {
		expect(resolveForbidUnknownFields('staging', undefined)).toBe(true);
	});

	it.each(['development', 'production', undefined])(
		'is off for %s by default',
		(env) => {
			expect(resolveForbidUnknownFields(env, undefined)).toBe(false);
		},
	);

	it('follows FORBID_UNKNOWN_FIELDS when set', () => {
		expect(resolveForbidUnknownFields('development', 'true')).toBe(true);
		expect(resolveForbidUnknownFields('staging', 'false')).toBe(false);
		expect(resolveForbidUnknownFields('staging', ' TRUE ')).toBe(true);
	});

	it('falls back to the default for an unrecognised value', () => {
		expect(resolveForbidUnknownFields('staging', 'yes')).toBe(true);
		expect(resolveForbidUnknownFields('production', 'yes')).toBe(false);
	});
});
