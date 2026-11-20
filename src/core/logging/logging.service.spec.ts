import { DomainLogger } from './logging.service';
import { OpenObserveTransport } from './openobserve.transport';

function fakeTransport() {
	return {
		send: vi.fn(),
		close: vi.fn(async () => undefined),
	} as unknown as OpenObserveTransport & { send: ReturnType<typeof vi.fn> };
}

describe('DomainLogger', () => {
	beforeEach(() => {
		vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('sends every printed level to OpenObserve with its context', () => {
		const transport = fakeTransport();
		const logger = new DomainLogger(undefined, transport);

		logger.log('started', 'Bootstrap');
		logger.warn('slow', 'Mailer');
		logger.debug('Request completed GET /x - 200', 'TelemetryInterceptor');
		logger.verbose('detail', 'Jobs');
		logger.fatal('dying', 'Process');

		expect(
			transport.send.mock.calls.map(([r]) => [r.level, r.message, r.context]),
		).toEqual([
			['log', 'started', 'Bootstrap'],
			['warn', 'slow', 'Mailer'],
			['debug', 'Request completed GET /x - 200', 'TelemetryInterceptor'],
			['verbose', 'detail', 'Jobs'],
			['fatal', 'dying', 'Process'],
		]);
	});

	it('sends the stack of an error with its message', () => {
		const transport = fakeTransport();
		const logger = new DomainLogger(undefined, transport);

		logger.error('Payment failed', 'Error: x\n    at y', 'Billing');
		const error = new Error('db down');
		logger.error(error);

		const [first, second] = transport.send.mock.calls.map(([r]) => r);
		expect(first).toMatchObject({
			level: 'error',
			message: 'Payment failed',
			context: 'Billing',
			stack: 'Error: x\n    at y',
		});
		expect(second.message).toBe('Error: db down');
		expect(second.stack).toContain('db down');
	});

	it('does not send levels that are switched off', () => {
		const transport = fakeTransport();
		const logger = new DomainLogger(undefined, transport);
		logger.setLogLevels(['error', 'warn']);

		logger.debug('noise');
		logger.warn('kept');

		expect(transport.send).toHaveBeenCalledTimes(1);
		expect(transport.send.mock.calls[0][0].message).toBe('kept');
	});

	it('still prints to the console, and only there, without OpenObserve', () => {
		const logger = new DomainLogger(undefined, null);
		expect(() => logger.error('x')).not.toThrow();
		expect(process.stderr.write).toHaveBeenCalled();
	});

	it('sends what is left on shutdown', async () => {
		const transport = fakeTransport();
		await new DomainLogger(undefined, transport).onApplicationShutdown();
		expect(transport.close).toHaveBeenCalled();
	});
});
