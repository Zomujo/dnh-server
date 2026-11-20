import {
	createOpenObserveTransport,
	OpenObserveTransport,
	stringifyLogMessage,
} from './openobserve.transport';

const config = {
	url: 'http://openobserve:5080/',
	org: 'staging',
	stream: 'api',
	user: 'api-staging@dnh.local',
	token: 'tok',
	environment: 'staging',
};

function okFetch() {
	return vi.fn(async () => new Response('{}', { status: 200 })) as any;
}

function sentRecords(fetchMock: any, call = 0) {
	return JSON.parse(fetchMock.mock.calls[call][1].body);
}

describe('OpenObserveTransport', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('posts queued records as one JSON batch with Basic auth to the org and stream', async () => {
		const fetchMock = okFetch();
		const transport = new OpenObserveTransport(config, fetchMock);

		transport.send({
			level: 'error',
			message: 'boom',
			context: 'Auth',
			stack: 'at x',
		});
		transport.send({ level: 'warn', message: 'careful' });
		await transport.flush();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://openobserve:5080/api/staging/api/_json');
		expect(init.headers.authorization).toBe(
			`Basic ${Buffer.from('api-staging@dnh.local:tok').toString('base64')}`,
		);
		const records = sentRecords(fetchMock);
		expect(records).toHaveLength(2);
		expect(records[0]).toMatchObject({
			service: 'dnh-api',
			environment: 'staging',
			level: 'error',
			message: 'boom',
			context: 'Auth',
			stack: 'at x',
		});
		expect(typeof records[0]._timestamp).toBe('number');
		expect(records[1]).not.toHaveProperty('context');
	});

	it('sends after the flush interval without being asked', async () => {
		vi.useFakeTimers();
		const fetchMock = okFetch();
		const transport = new OpenObserveTransport(
			{ ...config, flushIntervalMs: 1000 },
			fetchMock,
		);

		transport.send({ level: 'log', message: 'hello' });
		expect(fetchMock).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1000);

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('sends at once when a batch is full, and splits the rest into batches', async () => {
		const fetchMock = okFetch();
		const transport = new OpenObserveTransport(
			{ ...config, maxBatch: 2 },
			fetchMock,
		);

		for (let i = 0; i < 5; i++)
			transport.send({ level: 'log', message: `m${i}` });
		await transport.flush();

		const sizes = fetchMock.mock.calls.map(
			(_: unknown, i: number) => sentRecords(fetchMock, i).length,
		);
		expect(sizes).toEqual([2, 2, 1]);
		const messages = fetchMock.mock.calls.flatMap((_: unknown, i: number) =>
			sentRecords(fetchMock, i).map((r: { message: string }) => r.message),
		);
		expect(messages).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
	});

	it('drops a batch it cannot send, says so once on stderr, and never throws', async () => {
		const report = vi.fn();
		const fetchMock = vi.fn(async () => {
			throw new Error('ECONNREFUSED');
		}) as any;
		const transport = new OpenObserveTransport(config, fetchMock, report);

		transport.send({ level: 'error', message: 'a' });
		await expect(transport.flush()).resolves.toBeUndefined();
		transport.send({ level: 'error', message: 'b' });
		await transport.flush();

		expect(report).toHaveBeenCalledTimes(1);
		expect(report.mock.calls[0][0]).toContain('ECONNREFUSED');
		expect(report.mock.calls[0][0]).toContain('1 record(s) dropped');
	});

	it('treats an HTTP error status as a failed send', async () => {
		const report = vi.fn();
		const fetchMock = vi.fn(
			async () => new Response('no', { status: 401 }),
		) as any;
		const transport = new OpenObserveTransport(config, fetchMock, report);

		transport.send({ level: 'warn', message: 'x' });
		await transport.flush();

		expect(report.mock.calls[0][0]).toContain('HTTP 401');
	});

	it('keeps only the newest records when OpenObserve is unreachable for long', async () => {
		const fetchMock = okFetch();
		const report = vi.fn();
		const transport = new OpenObserveTransport(
			{ ...config, maxQueue: 3, maxBatch: 100 },
			fetchMock,
			report,
		);

		for (let i = 0; i < 5; i++)
			transport.send({ level: 'log', message: `m${i}` });
		await transport.flush();

		expect(
			sentRecords(fetchMock).map((r: { message: string }) => r.message),
		).toEqual(['m2', 'm3', 'm4']);
		expect(report.mock.calls[0][0]).toContain('2 record(s) were dropped');
	});

	it('truncates very long messages', async () => {
		const fetchMock = okFetch();
		const transport = new OpenObserveTransport(config, fetchMock);

		transport.send({ level: 'error', message: 'x'.repeat(20_000) });
		await transport.flush();

		const [record] = sentRecords(fetchMock);
		expect(record.message.length).toBeLessThan(16_100);
		expect(record.message).toContain('[truncated 4000 chars]');
	});
});

describe('createOpenObserveTransport', () => {
	it('is null unless the URL, user and token are all set', () => {
		expect(createOpenObserveTransport({})).toBeNull();
		expect(
			createOpenObserveTransport({
				OPENOBSERVE_URL: 'http://o:5080',
				OPENOBSERVE_USER: 'u',
			}),
		).toBeNull();
	});

	it('defaults the organization to NODE_ENV and the stream to api', async () => {
		const fetchMock = okFetch();
		const transport = createOpenObserveTransport({
			NODE_ENV: 'production',
			OPENOBSERVE_URL: 'http://openobserve:5080',
			OPENOBSERVE_USER: 'u',
			OPENOBSERVE_TOKEN: 't',
		});
		expect(transport).toBeInstanceOf(OpenObserveTransport);
		(transport as any).fetchImpl = fetchMock;

		transport!.send({ level: 'log', message: 'x' });
		await transport!.flush();

		expect(fetchMock.mock.calls[0][0]).toBe(
			'http://openobserve:5080/api/production/api/_json',
		);
	});
});

describe('stringifyLogMessage', () => {
	it('keeps strings, names errors and serialises objects', () => {
		expect(stringifyLogMessage('plain')).toBe('plain');
		expect(stringifyLogMessage(new TypeError('bad'))).toBe('TypeError: bad');
		expect(stringifyLogMessage({ a: 1 })).toBe('{"a":1}');
		const circular: any = {};
		circular.self = circular;
		expect(stringifyLogMessage(circular)).toBe('[object Object]');
	});
});
