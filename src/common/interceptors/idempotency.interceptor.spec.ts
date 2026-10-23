import {
	BadRequestException,
	CallHandler,
	ConflictException,
	ExecutionContext,
	UnprocessableEntityException,
} from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import type {
	IdempotencyRecord,
	IdempotencyStore,
} from '@/core/caching/idempotency.store';
import { hashRequest, IdempotencyInterceptor } from './idempotency.interceptor';

class MemoryStore {
	records = new Map<string, IdempotencyRecord>();
	async acquire(key: string, record: IdempotencyRecord) {
		if (this.records.has(key)) return false;
		this.records.set(key, record);
		return true;
	}
	async get(key: string) {
		return this.records.get(key) ?? null;
	}
	async save(key: string, record: IdempotencyRecord) {
		this.records.set(key, record);
	}
	async release(key: string) {
		this.records.delete(key);
	}
}

const KEY = '7b0e2f9c-5c1d-4c8e-9f7a-2d3b4c5d6e7f';

function setup(store = new MemoryStore()) {
	const interceptor = new IdempotencyInterceptor(
		store as unknown as IdempotencyStore,
	);

	const call = async (
		body: Record<string, unknown>,
		handlerResult: (response: { status(code: number): unknown }) => any,
		headers: Record<string, string> = { 'idempotency-key': KEY },
	) => {
		const response = {
			statusCode: 201,
			headers: {} as Record<string, string>,
			status(code: number) {
				this.statusCode = code;
				return this;
			},
			setHeader(name: string, value: string) {
				this.headers[name] = value;
			},
		};
		const request = {
			method: 'POST',
			route: { path: '/api/v1/client/vital-histories/logs' },
			query: {},
			body,
			headers,
			user: { sub: 'user-1' },
		};
		const context = {
			switchToHttp: () => ({
				getRequest: () => request,
				getResponse: () => response,
			}),
		} as unknown as ExecutionContext;
		const handle = vi.fn(() => handlerResult(response));
		const result = await firstValueFrom(
			interceptor.intercept(context, { handle } as CallHandler),
		);
		return { result, response, handle };
	};

	return { store, call };
}

describe('IdempotencyInterceptor', () => {
	const reading = { vitalType: 'bloodPressure', value: '120/80' };

	it('runs normally without the header', async () => {
		const { call, store } = setup();
		const { result, handle } = await call(reading, () => of({ id: 'v1' }), {});
		expect(result).toEqual({ id: 'v1' });
		expect(handle).toHaveBeenCalledTimes(1);
		expect(store.records.size).toBe(0);
	});

	it('replays the first response for the same key and body without re-running', async () => {
		const { call } = setup();
		const first = await call(reading, () => of({ id: 'v1' }));
		const second = await call({ ...reading }, () => of({ id: 'v2' }));

		expect(first.result).toEqual({ id: 'v1' });
		expect(second.result).toEqual({ id: 'v1' });
		expect(second.handle).not.toHaveBeenCalled();
		expect(second.response.statusCode).toBe(201);
		expect(second.response.headers['Idempotent-Replayed']).toBe('true');
	});

	it('treats bodies differing only in key order as the same request', async () => {
		const { call } = setup();
		await call({ a: 1, b: { c: 2, d: 3 } }, () => of('first'));
		const again = await call({ b: { d: 3, c: 2 }, a: 1 }, () => of('second'));
		expect(again.result).toBe('first');
	});

	it('rejects the same key with a different body (422)', async () => {
		const { call } = setup();
		await call(reading, () => of({ id: 'v1' }));
		await expect(
			call({ ...reading, value: '140/90' }, () => of({ id: 'v2' })),
		).rejects.toBeInstanceOf(UnprocessableEntityException);
	});

	it('rejects a retry while the first request is still running (409)', async () => {
		const { call, store } = setup();
		store.records.set(`idempotency:user-1:${KEY}`, {
			state: 'pending',
			requestHash: hashRequest({
				method: 'POST',
				route: { path: '/api/v1/client/vital-histories/logs' },
				query: {},
				body: reading,
			}),
		});
		await expect(call(reading, () => of({ id: 'v1' }))).rejects.toBeInstanceOf(
			ConflictException,
		);
	});

	it('releases the key when the handler fails so a retry runs again', async () => {
		const { call, store } = setup();
		await expect(
			call(reading, () => throwError(() => new Error('db down'))),
		).rejects.toThrow('db down');
		expect(store.records.size).toBe(0);

		const retry = await call(reading, () => of({ id: 'v1' }));
		expect(retry.handle).toHaveBeenCalledTimes(1);
		expect(retry.result).toEqual({ id: 'v1' });
	});

	it('stores and replays the status the handler set (e.g. 200 on a repeat onboard)', async () => {
		const { call } = setup();
		await call(reading, (response) => {
			response.status(200);
			return of('existing');
		});
		const replay = await call(reading, () => of('unused'));
		expect(replay.response.statusCode).toBe(200);
		expect(replay.result).toBe('existing');
	});

	it('scopes keys per user', async () => {
		const { call, store } = setup();
		await call(reading, () => of({ id: 'v1' }));
		expect([...store.records.keys()]).toEqual([`idempotency:user-1:${KEY}`]);
	});

	it.each([
		'short',
		'has spaces in it',
		'x'.repeat(129),
	])('rejects a malformed key %#', async (key) => {
		const { call } = setup();
		await expect(
			call(reading, () => of('ok'), { 'idempotency-key': key }),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
