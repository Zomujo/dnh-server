import { EventEmitter } from 'node:events';
import {
	CallHandler,
	ExecutionContext,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Mocked, TestBed } from '@suites/unit';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { UserType } from '@/core/auth/enums';
import { AuditInterceptor } from './audit.interceptor';
import { AUDIT_INTERCEPTED } from './audit.markers';
import { AuditService } from './audit.service';
import {
	AuditAction,
	AuditActorKind,
	type AuditLog,
	AuditOutcome,
} from './entities/audit-log.entity';

class FakeResponse extends EventEmitter {
	statusCode = 200;
	headersSent = false;
	writableFinished = false;
	end(statusCode = this.statusCode) {
		this.statusCode = statusCode;
		this.headersSent = true;
		this.writableFinished = true;
		this.emit('finish');
		this.emit('close');
	}
}

function httpContext(
	request: Record<string, unknown>,
	response: FakeResponse,
	type = 'http',
) {
	return {
		getType: () => type,
		getHandler: () => () => undefined,
		getClass: () => class {},
		switchToHttp: () => ({
			getRequest: () => request,
			getResponse: () => response,
		}),
	} as unknown as ExecutionContext;
}

const personnelRequest = (overrides: Record<string, unknown> = {}) => ({
	method: 'GET',
	route: { path: '/api/v1/hcp/patients/:id' },
	params: { id: '665f1c2e9b1d4a0012345678' },
	headers: { 'user-agent': 'vitest' },
	ip: '203.0.113.7',
	user: { sub: 'p-1', aud: 'dnh', role: 'clinician', facility: 'f-1' },
	body: { name: 'Jane Doe' },
	...overrides,
});

describe('AuditInterceptor', () => {
	let interceptor: AuditInterceptor;
	let auditService: Mocked<AuditService>;
	let reflector: Mocked<Reflector>;

	beforeEach(async () => {
		vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
		const { unit, unitRef } =
			await TestBed.solitary(AuditInterceptor).compile();
		interceptor = unit;
		auditService = unitRef.get(AuditService);
		reflector = unitRef.get(Reflector);
		reflector.getAllAndOverride.mockReturnValue(UserType.CHRONIC_CARE);
	});
	afterEach(() => vi.restoreAllMocks());

	const recorded = () =>
		auditService.record.mock.calls.map(([entry]) => entry as AuditLog);

	it('records a personnel read of a patient once the response finishes', async () => {
		const response = new FakeResponse();
		const handle = vi.fn(() => of({ data: { name: 'Jane Doe' } }));

		await firstValueFrom(
			interceptor.intercept(httpContext(personnelRequest(), response), {
				handle,
			} as CallHandler),
		);
		expect(auditService.record).not.toHaveBeenCalled();

		response.end(200);

		expect(recorded()).toHaveLength(1);
		const [entry] = recorded();
		expect(entry).toMatchObject({
			action: AuditAction.READ,
			method: 'GET',
			route: '/api/v1/hcp/patients/:id',
			resourceType: 'patients',
			resourceId: '665f1c2e9b1d4a0012345678',
			patientId: '665f1c2e9b1d4a0012345678',
			statusCode: 200,
			outcome: AuditOutcome.SUCCESS,
			ip: '203.0.113.7',
			userAgent: 'vitest',
			actor: {
				kind: AuditActorKind.PERSONNEL,
				userId: 'p-1',
				role: 'clinician',
				facilityId: 'f-1',
			},
		});
		// Neither the request nor the response body is stored.
		expect(JSON.stringify(entry)).not.toContain('Jane Doe');
	});

	it('records once even though finish and close both fire', async () => {
		const response = new FakeResponse();
		await firstValueFrom(
			interceptor.intercept(
				httpContext(personnelRequest({ method: 'PATCH' }), response),
				{ handle: () => of({}) } as CallHandler,
			),
		);
		response.end(200);
		response.emit('close');
		expect(auditService.record).toHaveBeenCalledTimes(1);
	});

	it('skips requests that are not audited', async () => {
		reflector.getAllAndOverride.mockReturnValue(UserType.DH_CLIENTS);
		const response = new FakeResponse();
		const result = await firstValueFrom(
			interceptor.intercept(
				httpContext(
					{
						method: 'GET',
						route: { path: '/api/v1/client/medications' },
						params: {},
						headers: {},
						user: { uid: 'uid-1' },
					},
					response,
				),
				{ handle: () => of('ok') } as CallHandler,
			),
		);
		response.end(200);
		expect(result).toBe('ok');
		expect(auditService.record).not.toHaveBeenCalled();
	});

	it('skips non-HTTP contexts', async () => {
		const handle = vi.fn(() => of('ws'));
		const context = httpContext(personnelRequest(), new FakeResponse(), 'ws');
		await expect(
			firstValueFrom(interceptor.intercept(context, { handle })),
		).resolves.toBe('ws');
		expect(auditService.record).not.toHaveBeenCalled();
	});

	it('records a failed login and rethrows the original error', async () => {
		reflector.getAllAndOverride.mockReturnValue(undefined);
		const response = new FakeResponse();
		const error = new UnauthorizedException('Invalid credentials');

		await expect(
			firstValueFrom(
				interceptor.intercept(
					httpContext(
						{
							method: 'POST',
							route: { path: '/api/v1/personnel/auth/login' },
							params: {},
							headers: {},
							ip: '198.51.100.1',
							body: { email: 'nurse@example.com', password: 'hunter2' },
						},
						response,
					),
					{ handle: () => throwError(() => error) } as CallHandler,
				),
			),
		).rejects.toBe(error);

		// Nest's exception handling then sends the 401.
		response.end(401);

		const [entry] = recorded();
		expect(entry).toMatchObject({
			action: AuditAction.LOGIN,
			statusCode: 401,
			outcome: AuditOutcome.FAILURE,
			actor: { kind: AuditActorKind.PERSONNEL },
		});
		expect(entry.actor.userId).toBeUndefined();
		expect(JSON.stringify(entry)).not.toMatch(/hunter2|nurse@example\.com/);
	});

	it('uses the error status when the client hangs up after the handler failed', async () => {
		const response = new FakeResponse();
		await expect(
			firstValueFrom(
				interceptor.intercept(
					httpContext(personnelRequest({ method: 'DELETE' }), response),
					{
						handle: () => throwError(() => new Error('boom')),
					} as CallHandler,
				),
			),
		).rejects.toThrow('boom');

		response.emit('close');
		expect(recorded()[0]).toMatchObject({
			statusCode: 500,
			outcome: AuditOutcome.FAILURE,
		});
	});

	it('waits for the handler when the client hangs up first, then records its error', async () => {
		reflector.getAllAndOverride.mockReturnValue(undefined);
		const response = new FakeResponse();
		const handler = new Subject<unknown>();
		const result = firstValueFrom(
			interceptor.intercept(
				httpContext(
					{
						method: 'POST',
						route: { path: '/api/v1/personnel/auth/login' },
						params: {},
						headers: {},
					},
					response,
				),
				{ handle: () => handler.asObservable() } as CallHandler,
			),
		);

		// Client disconnects while the login is still being checked.
		response.emit('close');
		expect(auditService.record).not.toHaveBeenCalled();

		const error = new UnauthorizedException('Invalid credentials');
		handler.error(error);
		await expect(result).rejects.toBe(error);

		expect(recorded()).toHaveLength(1);
		expect(recorded()[0]).toMatchObject({
			action: AuditAction.LOGIN,
			statusCode: 401,
			outcome: AuditOutcome.FAILURE,
		});
	});

	it('records a handler that completes after the client hung up as aborted, with no status', async () => {
		const response = new FakeResponse();
		const handler = new Subject<unknown>();
		const result = firstValueFrom(
			interceptor.intercept(
				httpContext(personnelRequest({ method: 'PATCH' }), response),
				{ handle: () => handler.asObservable() } as CallHandler,
			),
		);

		response.emit('close');
		handler.next({ data: 'updated' });
		handler.complete();
		await result;

		expect(recorded()).toHaveLength(1);
		const [entry] = recorded();
		expect(entry.outcome).toBe(AuditOutcome.ABORTED);
		expect(entry.statusCode).toBeUndefined();
	});

	it('marks the request as intercepted, so the denied-request middleware skips it', async () => {
		const request = personnelRequest();
		await firstValueFrom(
			interceptor.intercept(httpContext(request, new FakeResponse()), {
				handle: () => of('ok'),
			} as CallHandler),
		);
		expect((request as Record<symbol, unknown>)[AUDIT_INTERCEPTED]).toBe(true);
	});

	it('identifies the personnel on a successful login without storing the token', async () => {
		reflector.getAllAndOverride.mockReturnValue(undefined);
		const response = new FakeResponse();
		await firstValueFrom(
			interceptor.intercept(
				httpContext(
					{
						method: 'POST',
						route: { path: '/api/v1/personnel/auth/login' },
						params: {},
						headers: {},
					},
					response,
				),
				{
					handle: () =>
						of({ data: { personnelId: 'p-7', token: 'secret.jwt.token' } }),
				} as CallHandler,
			),
		);
		response.end(200);

		const [entry] = recorded();
		expect(entry.actor).toMatchObject({ userId: 'p-7', personnelId: 'p-7' });
		expect(JSON.stringify(entry)).not.toContain('secret.jwt.token');
	});

	it('does not break the request when the audit write throws', async () => {
		auditService.record.mockImplementation(() => {
			throw new Error('mongo down');
		});
		const response = new FakeResponse();
		const result = await firstValueFrom(
			interceptor.intercept(
				httpContext(personnelRequest({ method: 'POST' }), response),
				{ handle: () => of({ data: 'created' }) } as CallHandler,
			),
		);
		expect(() => response.end(201)).not.toThrow();
		expect(result).toEqual({ data: 'created' });
		expect(Logger.prototype.error).toHaveBeenCalled();
	});

	it('does not break the request when deciding what to audit throws', async () => {
		reflector.getAllAndOverride.mockImplementation(() => {
			throw new Error('metadata');
		});
		const result = await firstValueFrom(
			interceptor.intercept(
				httpContext(personnelRequest(), new FakeResponse()),
				{
					handle: () => of('ok'),
				} as CallHandler,
			),
		);
		expect(result).toBe('ok');
	});
});
