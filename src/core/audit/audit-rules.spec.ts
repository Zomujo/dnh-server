import { Types } from 'mongoose';
import { UserType } from '@/core/auth/enums';
import {
	actorForAuthEvent,
	actorFromRequest,
	auditActionFor,
	buildAuditEntry,
	cleanId,
	extractResource,
	requestIdFrom,
	routeTemplate,
} from './audit-rules';
import {
	AuditAction,
	type AuditActor,
	AuditActorKind,
	AuditOutcome,
} from './entities/audit-log.entity';

const personnel: AuditActor = {
	kind: AuditActorKind.PERSONNEL,
	userType: UserType.CHRONIC_CARE,
	userId: 'p-1',
	personnelId: 'p-1',
	role: 'clinician',
};
const patient: AuditActor = {
	kind: AuditActorKind.PATIENT,
	userType: UserType.DH_CLIENTS,
	userId: 'uid-1',
};
const anonymous: AuditActor = { kind: AuditActorKind.ANONYMOUS };

describe('routeTemplate', () => {
	it('uses the matched route path, not the URL', () => {
		expect(
			routeTemplate({
				method: 'GET',
				route: { path: '/api/v1/hcp/patients/:id' },
				headers: {},
			}),
		).toBe('/api/v1/hcp/patients/:id');
	});

	it('is undefined when no route matched', () => {
		expect(routeTemplate({ method: 'GET', headers: {} })).toBeUndefined();
	});
});

describe('extractResource', () => {
	it('takes the last param as the resource id', () => {
		expect(
			extractResource('/api/v1/hcp/patients/:patientId/symptoms/:id', {
				patientId: 'pat-1',
				id: 'sym-1',
			}),
		).toEqual({
			resourceType: 'symptoms',
			resourceId: 'sym-1',
			patientId: 'pat-1',
		});
	});

	it('treats patients/:id as the patient', () => {
		expect(
			extractResource('/api/v1/hcp/patients/:id', { id: 'pat-1' }),
		).toEqual({
			resourceType: 'patients',
			resourceId: 'pat-1',
			patientId: 'pat-1',
		});
	});

	it('names the resource before the last param on action routes', () => {
		expect(
			extractResource('/api/v1/hcp/patients/:patientId/symptoms/:id/resolve', {
				patientId: 'pat-1',
				id: 'sym-1',
			}),
		).toMatchObject({ resourceType: 'symptoms', resourceId: 'sym-1' });
	});

	it('uses the last segment for routes without params', () => {
		expect(extractResource('/api/v1/hcp/patients')).toEqual({
			resourceType: 'patients',
			resourceId: undefined,
			patientId: undefined,
		});
	});

	it('reads the patient_id param form', () => {
		expect(
			extractResource(
				'/api/v1/personnel/pharmacies/vital-histories/:patient_id/trends',
				{ patient_id: 'pat-2' },
			),
		).toMatchObject({ resourceId: 'pat-2', patientId: 'pat-2' });
	});

	it('drops param values that are not id-shaped', () => {
		expect(
			extractResource('/api/v1/hcp/patients/:id', {
				id: 'jane@example.com',
			}),
		).toMatchObject({ resourceId: undefined, patientId: undefined });
	});
});

describe('auditActionFor (skip rules)', () => {
	it('records writes by any authenticated user', () => {
		expect(auditActionFor('POST', '/api/v1/client/chat', patient)).toBe(
			AuditAction.CREATE,
		);
		expect(auditActionFor('PATCH', '/api/v1/hcp/patients/:id', personnel)).toBe(
			AuditAction.UPDATE,
		);
		expect(
			auditActionFor('PUT', '/api/v1/client/medications/:id/confirm', patient),
		).toBe(AuditAction.UPDATE);
		expect(
			auditActionFor('DELETE', '/api/v1/hcp/vital-histories/:id', personnel),
		).toBe(AuditAction.DELETE);
	});

	it('records personnel reads of patient data', () => {
		for (const route of [
			'/api/v1/hcp/patients',
			'/api/v1/hcp/patients/:id',
			'/api/v1/hcp/patients/:patientId/medications',
			'/api/v1/personnel/pharmacies/vital-histories/:id',
			'/api/v1/chat/hcp/rooms/:roomId/messages',
		]) {
			expect(auditActionFor('GET', route, personnel)).toBe(AuditAction.READ);
		}
	});

	it('skips personnel reads of reference data', () => {
		for (const route of [
			'/api/v1/facilities',
			'/api/v1/seeded-meds',
			'/api/v1/chronic-care/notifications',
			'/api/v1/chronic-care/doctors/analytics',
			'/api/v1/personnel/auth/current',
		]) {
			expect(auditActionFor('GET', route, personnel)).toBeUndefined();
		}
	});

	it('skips patients reading their own data', () => {
		expect(
			auditActionFor('GET', '/api/v1/client/medications', patient),
		).toBeUndefined();
	});

	it('skips unauthenticated traffic outside the auth endpoints', () => {
		expect(auditActionFor('GET', '/', anonymous)).toBeUndefined();
		expect(auditActionFor('POST', '/api/v1/ussd', anonymous)).toBeUndefined();
		expect(
			auditActionFor('GET', '/api/v1/facilities', anonymous),
		).toBeUndefined();
	});

	it('skips HEAD and OPTIONS', () => {
		expect(
			auditActionFor('OPTIONS', '/api/v1/hcp/patients', personnel),
		).toBeUndefined();
		expect(
			auditActionFor('HEAD', '/api/v1/hcp/patients', personnel),
		).toBeUndefined();
	});

	it('always records the auth endpoints', () => {
		expect(
			auditActionFor('POST', '/api/v1/personnel/auth/login', anonymous),
		).toBe(AuditAction.LOGIN);
		expect(
			auditActionFor('POST', '/api/v1/personnel/auth/login/google', anonymous),
		).toBe(AuditAction.LOGIN);
		expect(
			auditActionFor('POST', '/api/v1/personnel/auth/otp/verify', anonymous),
		).toBe(AuditAction.OTP_VERIFY);
		expect(auditActionFor('POST', '/api/v1/auth/signup', anonymous)).toBe(
			AuditAction.SIGNUP,
		);
		expect(auditActionFor('POST', '/api/v1/auth/onboard', patient)).toBe(
			AuditAction.ONBOARD,
		);
	});
});

describe('actorFromRequest', () => {
	it('maps a personnel token without its email', () => {
		expect(
			actorFromRequest(
				{
					sub: 'p-1',
					aud: 'dnh',
					role: 'pharmacy',
					email: 'nurse@example.com',
					facility: 'f-1',
				},
				UserType.CHRONIC_CARE,
			),
		).toEqual({
			kind: AuditActorKind.PERSONNEL,
			userType: UserType.CHRONIC_CARE,
			userId: 'p-1',
			personnelId: 'p-1',
			role: 'pharmacy',
			facilityId: 'f-1',
		});
	});

	it('maps a Firebase token without its email or phone', () => {
		expect(
			actorFromRequest(
				{
					uid: 'uid-1',
					sub: 'uid-1',
					email: 'p@example.com',
					phone_number: '+233200000000',
				},
				UserType.DH_CLIENTS,
			),
		).toEqual({
			kind: AuditActorKind.PATIENT,
			userType: UserType.DH_CLIENTS,
			userId: 'uid-1',
		});
	});

	it('is anonymous without a user', () => {
		expect(actorFromRequest(undefined, undefined)).toEqual({
			kind: AuditActorKind.ANONYMOUS,
		});
	});
});

describe('actorForAuthEvent', () => {
	it('takes only the personnel id from a successful login, not the token', () => {
		const actor = actorForAuthEvent(
			'POST',
			'/api/v1/personnel/auth/login',
			anonymous,
			{ data: { personnelId: 'p-9', token: 'secret.jwt.token' } },
		);
		expect(actor).toEqual({
			kind: AuditActorKind.PERSONNEL,
			userType: UserType.CHRONIC_CARE,
			userId: 'p-9',
			personnelId: 'p-9',
		});
		expect(JSON.stringify(actor)).not.toContain('secret');
	});

	it('leaves a failed login unidentified', () => {
		expect(
			actorForAuthEvent(
				'POST',
				'/api/v1/personnel/auth/login',
				anonymous,
				undefined,
			),
		).toEqual({
			kind: AuditActorKind.PERSONNEL,
			userType: UserType.CHRONIC_CARE,
		});
	});

	it('records the patient record id (an ObjectId) from onboarding', () => {
		const patientId = new Types.ObjectId();
		expect(
			actorForAuthEvent('POST', '/api/v1/auth/onboard', patient, {
				data: patientId,
			}),
		).toEqual({ ...patient, patientId: patientId.toHexString() });
	});

	it('records the patient Firebase uid from signup', () => {
		expect(
			actorForAuthEvent('POST', '/api/v1/auth/signup', anonymous, {
				data: 'Xy9fUidFromFirebase01',
			}),
		).toEqual({
			kind: AuditActorKind.PATIENT,
			userType: UserType.DH_CLIENTS,
			userId: 'Xy9fUidFromFirebase01',
		});
	});

	it.each(['/api/v1/personnel/auth/signup', '/api/v1/personnel/auth/onboard'])(
		'records the personnel id (an ObjectId) returned by %s',
		(route) => {
			const personnelId = new Types.ObjectId();
			expect(
				actorForAuthEvent('POST', route, anonymous, { data: personnelId }),
			).toEqual({
				kind: AuditActorKind.PERSONNEL,
				userType: UserType.CHRONIC_CARE,
				userId: personnelId.toHexString(),
				personnelId: personnelId.toHexString(),
			});
		},
	);

	it('ignores non-auth routes', () => {
		expect(
			actorForAuthEvent('POST', '/api/v1/hcp/patients', personnel, {
				data: { personnelId: 'other' },
			}),
		).toBe(personnel);
	});
});

describe('buildAuditEntry (redaction)', () => {
	const request = {
		method: 'post',
		route: { path: '/api/v1/personnel/auth/login' },
		params: {},
		query: { key: 'ussd-secret', phone: '+233200000000' },
		body: { email: 'nurse@example.com', password: 'hunter2', otp: '123456' },
		headers: {
			authorization: 'Bearer secret.jwt.token',
			cookie: 'session=abc',
			'user-agent': `Mozilla/5.0 ${'x'.repeat(500)}`,
			'x-request-id': 'req-123',
		},
		ip: '203.0.113.7',
	};

	const entry = buildAuditEntry({
		request,
		route: '/api/v1/personnel/auth/login',
		action: AuditAction.LOGIN,
		actor: { kind: AuditActorKind.PERSONNEL },
		statusCode: 401,
		now: new Date('2026-11-19T10:00:00Z'),
	});

	it('stores only the audit fields', () => {
		expect(Object.keys(entry).sort()).toEqual(
			[
				'action',
				'actor',
				'ip',
				'method',
				'outcome',
				'patientId',
				'requestId',
				'resourceId',
				'resourceType',
				'route',
				'statusCode',
				'timestamp',
				'userAgent',
			].sort(),
		);
		expect(entry).toMatchObject({
			method: 'POST',
			statusCode: 401,
			outcome: AuditOutcome.FAILURE,
			ip: '203.0.113.7',
			requestId: 'req-123',
		});
		expect(entry.userAgent).toHaveLength(256);
	});

	it('never contains the body, query, token or cookie', () => {
		const stored = JSON.stringify(entry);
		for (const secret of [
			'hunter2',
			'123456',
			'nurse@example.com',
			'ussd-secret',
			'+233200000000',
			'secret.jwt.token',
			'session=abc',
		]) {
			expect(stored).not.toContain(secret);
		}
	});

	it('marks 2xx/3xx as success', () => {
		expect(
			buildAuditEntry({
				request,
				route: '/api/v1/personnel/auth/login',
				action: AuditAction.LOGIN,
				actor: anonymous,
				statusCode: 200,
			}).outcome,
		).toBe(AuditOutcome.SUCCESS);
	});

	it('is aborted, with no status, when no response was sent', () => {
		const entry = buildAuditEntry({
			request,
			route: '/api/v1/personnel/auth/login',
			action: AuditAction.LOGIN,
			actor: anonymous,
		});
		expect(entry.outcome).toBe(AuditOutcome.ABORTED);
		expect(entry.statusCode).toBeUndefined();
	});
});

describe('cleanId', () => {
	it('accepts id-shaped strings and ObjectIds', () => {
		const id = new Types.ObjectId();
		expect(cleanId(id)).toBe(id.toHexString());
		expect(cleanId(id.toHexString())).toBe(id.toHexString());
		expect(cleanId('abc_DEF-123')).toBe('abc_DEF-123');
	});

	it('drops anything else', () => {
		for (const value of [
			undefined,
			null,
			42,
			{ id: 'x' },
			'jane@example.com',
			'has space',
		]) {
			expect(cleanId(value)).toBeUndefined();
		}
	});
});

describe('requestIdFrom', () => {
	it('ignores malformed request ids', () => {
		expect(requestIdFrom({ 'x-request-id': 'a b<script>' })).toBeUndefined();
		expect(requestIdFrom({ 'x-railway-request-id': 'rw-1' })).toBe('rw-1');
	});
});
