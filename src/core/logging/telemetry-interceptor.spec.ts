import { Logger } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { TelemetryInterceptor } from './telemetry-interceptor';

// Outside development these lines go to the external log service, so they
// must not carry tokens or personal data.
describe('TelemetryInterceptor', () => {
	it('logs the route pattern and status, not headers, body or concrete URL', async () => {
		const debug = vi
			.spyOn(Logger.prototype, 'debug')
			.mockImplementation(() => undefined);
		const request = {
			method: 'POST',
			route: { path: '/api/v1/client/vital-histories/logs' },
			url: '/api/v1/client/vital-histories/logs?phone=+233541234567',
			headers: { authorization: 'Bearer secret-token' },
			body: { value: '180/120', name: 'Ama Mensah' },
		};
		const context = {
			getType: () => 'http',
			switchToHttp: () => ({
				getRequest: () => request,
				getResponse: () => ({ statusCode: 201 }),
			}),
		} as any;

		await lastValueFrom(
			new TelemetryInterceptor().intercept(context, {
				handle: () => of('ok'),
			}) as any,
		);

		const logged = JSON.stringify(debug.mock.calls);
		expect(logged).toContain('POST /api/v1/client/vital-histories/logs - 201');
		for (const secret of ['secret-token', '180/120', 'Ama', '+233541234567']) {
			expect(logged).not.toContain(secret);
		}
		debug.mockRestore();
	});
});
