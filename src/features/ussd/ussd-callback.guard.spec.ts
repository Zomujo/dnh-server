import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UssdCallbackGuard } from './ussd-callback.guard';

function guardWith(env: Record<string, string>) {
	const config = { get: (key: string) => env[key] } as ConfigService;
	return new UssdCallbackGuard(config);
}

function contextFor(request: {
	ip?: string;
	query?: Record<string, unknown>;
	headers?: Record<string, unknown>;
}) {
	return {
		switchToHttp: () => ({
			getRequest: () => ({ query: {}, headers: {}, ...request }),
		}),
	} as unknown as ExecutionContext;
}

describe('UssdCallbackGuard', () => {
	it('allows every caller when nothing is configured', () => {
		expect(guardWith({}).canActivate(contextFor({ ip: '1.2.3.4' }))).toBe(true);
	});

	describe('with USSD_CALLBACK_SECRET', () => {
		const guard = guardWith({ USSD_CALLBACK_SECRET: 's3cret' });

		it('accepts the key in the query string', () => {
			expect(guard.canActivate(contextFor({ query: { key: 's3cret' } }))).toBe(
				true,
			);
		});

		it('accepts the key in the x-ussd-key header', () => {
			expect(
				guard.canActivate(contextFor({ headers: { 'x-ussd-key': 's3cret' } })),
			).toBe(true);
		});

		it.each([
			['missing', {}],
			['wrong', { key: 'nope' }],
			['a different length', { key: 's3cret-but-longer' }],
			['not a string', { key: ['s3cret'] }],
		])('rejects a %s key', (_label, query) => {
			expect(() => guard.canActivate(contextFor({ query }))).toThrow(
				ForbiddenException,
			);
		});
	});

	describe('with USSD_ALLOWED_IPS', () => {
		const guard = guardWith({ USSD_ALLOWED_IPS: '10.0.0.1, 10.0.0.2' });

		it('accepts a listed IP, including its IPv4-mapped form', () => {
			expect(guard.canActivate(contextFor({ ip: '10.0.0.2' }))).toBe(true);
			expect(guard.canActivate(contextFor({ ip: '::ffff:10.0.0.1' }))).toBe(
				true,
			);
		});

		it('rejects an unlisted IP', () => {
			expect(() => guard.canActivate(contextFor({ ip: '10.0.0.3' }))).toThrow(
				ForbiddenException,
			);
		});
	});

	it('requires both the IP and the key when both are configured', () => {
		const guard = guardWith({
			USSD_CALLBACK_SECRET: 's3cret',
			USSD_ALLOWED_IPS: '10.0.0.1',
		});
		expect(() =>
			guard.canActivate(contextFor({ ip: '10.0.0.1', query: { key: 'x' } })),
		).toThrow(ForbiddenException);
		expect(() =>
			guard.canActivate(
				contextFor({ ip: '10.0.0.9', query: { key: 's3cret' } }),
			),
		).toThrow(ForbiddenException);
		expect(
			guard.canActivate(
				contextFor({ ip: '10.0.0.1', query: { key: 's3cret' } }),
			),
		).toBe(true);
	});
});
