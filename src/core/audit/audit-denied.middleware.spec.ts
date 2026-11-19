import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { type Mocked, TestBed } from '@suites/unit';
import type { NextFunction, Request, Response } from 'express';
import { UserType } from '@/core/auth/enums';
import { AUDIT_INTERCEPTED, markAuthRequired } from './audit.markers';
import { AuditService } from './audit.service';
import { AuditDeniedMiddleware } from './audit-denied.middleware';
import {
	AuditAction,
	AuditActorKind,
	type AuditLog,
	AuditOutcome,
} from './entities/audit-log.entity';

class FakeResponse extends EventEmitter {
	statusCode = 200;
}

describe('AuditDeniedMiddleware', () => {
	let middleware: AuditDeniedMiddleware;
	let auditService: Mocked<AuditService>;

	beforeEach(async () => {
		vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
		const { unit, unitRef } = await TestBed.solitary(
			AuditDeniedMiddleware,
		).compile();
		middleware = unit;
		auditService = unitRef.get(AuditService);
	});
	afterEach(() => vi.restoreAllMocks());

	const run = (
		request: Record<string | symbol, unknown>,
		statusCode: number,
		{ guarded = true }: { guarded?: boolean } = {},
	) => {
		const response = new FakeResponse();
		const next = vi.fn();
		middleware.use(
			request as unknown as Request,
			response as unknown as Response,
			next as NextFunction,
		);
		expect(next).toHaveBeenCalledOnce();
		// What AuthGuard does on a protected route, then the response goes out.
		if (guarded) markAuthRequired(request, UserType.CHRONIC_CARE);
		response.statusCode = statusCode;
		response.emit('finish');
		return auditService.record.mock.calls.map(([e]) => e as AuditLog);
	};

	const baseRequest = () => ({
		method: 'GET',
		route: { path: '/api/v1/hcp/patients/:id' },
		params: { id: '665f1c2e9b1d4a0012345678' },
		headers: {
			authorization: 'Bearer expired.jwt.token',
			'user-agent': 'vitest',
		},
		ip: '203.0.113.7',
		body: { secret: 'value' },
	});

	it('records a 401 from AuthGuard as an anonymous ACCESS_DENIED', () => {
		const [entry] = run(baseRequest(), 401);
		expect(entry).toMatchObject({
			action: AuditAction.ACCESS_DENIED,
			route: '/api/v1/hcp/patients/:id',
			patientId: '665f1c2e9b1d4a0012345678',
			statusCode: 401,
			outcome: AuditOutcome.FAILURE,
			actor: { kind: AuditActorKind.ANONYMOUS },
			ip: '203.0.113.7',
		});
		expect(JSON.stringify(entry)).not.toMatch(/expired\.jwt\.token|value/);
	});

	it('records a 403 from RolesGuard with the verified actor', () => {
		const [entry] = run(
			{
				...baseRequest(),
				user: { sub: 'p-1', aud: 'dnh', role: 'pharmacy', facility: 'f-1' },
			},
			403,
		);
		expect(entry).toMatchObject({
			action: AuditAction.ACCESS_DENIED,
			statusCode: 403,
			actor: {
				kind: AuditActorKind.PERSONNEL,
				userId: 'p-1',
				role: 'pharmacy',
			},
		});
	});

	it('skips requests the interceptor already handled', () => {
		expect(run({ ...baseRequest(), [AUDIT_INTERCEPTED]: true }, 403)).toEqual(
			[],
		);
	});

	it('skips public routes and other statuses', () => {
		expect(run(baseRequest(), 403, { guarded: false })).toEqual([]);
		expect(run(baseRequest(), 200)).toEqual([]);
		expect(run(baseRequest(), 429)).toEqual([]);
	});

	it('never throws into the response when recording fails', () => {
		auditService.record.mockImplementation(() => {
			throw new Error('mongo down');
		});
		expect(() => run(baseRequest(), 401)).not.toThrow();
		expect(Logger.prototype.error).toHaveBeenCalled();
	});
});
