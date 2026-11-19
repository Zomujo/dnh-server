import { Types } from 'mongoose';
import { UserType } from '@/core/auth/enums';
import {
	AuditAction,
	type AuditActor,
	AuditActorKind,
	type AuditLog,
	AuditOutcome,
} from './entities/audit-log.entity';

export const API_PREFIX = '/api/v1';

/**
 * Public auth endpoints. These are audited whether or not they succeed,
 * and whoever calls them (there is no `request.user` yet). Keyed on
 * `METHOD route-without-prefix`.
 */
const AUTH_EVENTS: Record<
	string,
	{ action: AuditAction; kind: AuditActorKind }
> = {
	'POST /personnel/auth/login': {
		action: AuditAction.LOGIN,
		kind: AuditActorKind.PERSONNEL,
	},
	'POST /personnel/auth/login/google': {
		action: AuditAction.LOGIN,
		kind: AuditActorKind.PERSONNEL,
	},
	'POST /personnel/auth/signup': {
		action: AuditAction.SIGNUP,
		kind: AuditActorKind.PERSONNEL,
	},
	'POST /personnel/auth/onboard': {
		action: AuditAction.ONBOARD,
		kind: AuditActorKind.PERSONNEL,
	},
	'POST /personnel/auth/otp/re-send': {
		action: AuditAction.OTP_SEND,
		kind: AuditActorKind.PERSONNEL,
	},
	'POST /personnel/auth/otp/verify': {
		action: AuditAction.OTP_VERIFY,
		kind: AuditActorKind.PERSONNEL,
	},
	// Patients sign in with Firebase on the device; the API only sees the
	// account creation and the onboarding that creates the patient record.
	'POST /auth/signup': {
		action: AuditAction.SIGNUP,
		kind: AuditActorKind.PATIENT,
	},
	'POST /auth/onboard': {
		action: AuditAction.ONBOARD,
		kind: AuditActorKind.PATIENT,
	},
};

/**
 * Route segments that mean a personnel GET is reading a patient's health
 * data (records, vitals, medications, adherence, symptoms, appointments,
 * chat with patients). Reference data (facilities, seeded meds,
 * notifications, analytics, own account) is not audited on read.
 */
const PATIENT_DATA_SEGMENTS = new Set([
	'patients',
	'vital-histories',
	'vitals',
	'medications',
	'adherence',
	'symptoms',
	'concerns',
	'appointments',
	'appointment-requests',
	'chat',
]);

/** Route params that name the patient the request is about. */
const PATIENT_PARAMS = ['patientId', 'patient_id'];

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const USER_AGENT_MAX = 256;

/** The subset of an Express request the audit trail reads. */
export interface AuditRequest {
	method: string;
	route?: { path?: unknown };
	params?: Record<string, unknown>;
	headers: Record<string, string | string[] | undefined>;
	ip?: string;
	user?: Record<string, unknown>;
}

/**
 * The matched route template (`/api/v1/hcp/patients/:id`), never the raw
 * URL, so ids and query strings (which can hold PII or the USSD secret)
 * don't end up in the log.
 */
export function routeTemplate(request: AuditRequest): string | undefined {
	const path = request.route?.path;
	return typeof path === 'string' && path.length > 0 ? path : undefined;
}

function withoutPrefix(route: string) {
	return route.startsWith(API_PREFIX)
		? route.slice(API_PREFIX.length) || '/'
		: route;
}

function authEvent(method: string, route: string) {
	return AUTH_EVENTS[`${method.toUpperCase()} ${withoutPrefix(route)}`];
}

function staticSegments(route: string) {
	return withoutPrefix(route)
		.split('/')
		.filter((segment) => segment && !segment.startsWith(':'));
}

/** An id as a string: id-shaped strings and ObjectIds; anything else is dropped. */
export function cleanId(value: unknown): string | undefined {
	if (typeof value === 'string') {
		return ID_PATTERN.test(value) ? value : undefined;
	}
	if (value instanceof Types.ObjectId) return value.toHexString();
	// An ObjectId from another copy of bson (e.g. the native driver's).
	if (
		value &&
		typeof value === 'object' &&
		(value as { _bsontype?: unknown })._bsontype === 'ObjectId' &&
		typeof (value as { toHexString?: unknown }).toHexString === 'function'
	) {
		return cleanId((value as { toHexString(): string }).toHexString());
	}
	return undefined;
}

/**
 * Resource type, resource id and subject patient from the route template
 * and its params:
 * - resource id: the value of the last param in the template
 * - resource type: the static segment just before that param, or the last
 *   static segment when the route has no params
 * - patient: a `patientId`/`patient_id` param, or the id itself on a
 *   `patients/:id` route
 */
export function extractResource(
	route: string,
	params: Record<string, unknown> = {},
): { resourceType?: string; resourceId?: string; patientId?: string } {
	const segments = withoutPrefix(route).split('/').filter(Boolean);

	let lastParamIndex = -1;
	for (let i = segments.length - 1; i >= 0; i--) {
		if (segments[i].startsWith(':')) {
			lastParamIndex = i;
			break;
		}
	}

	let resourceType: string | undefined;
	let resourceId: string | undefined;
	if (lastParamIndex === -1) {
		resourceType = segments.at(-1);
	} else {
		resourceId = cleanId(params[segments[lastParamIndex].slice(1)]);
		for (let i = lastParamIndex - 1; i >= 0; i--) {
			if (!segments[i].startsWith(':')) {
				resourceType = segments[i];
				break;
			}
		}
	}

	let patientId: string | undefined;
	for (const name of PATIENT_PARAMS) {
		patientId ??= cleanId(params[name]);
	}
	if (!patientId && resourceType === 'patients') patientId = resourceId;

	return { resourceType, resourceId, patientId };
}

export function actionForMethod(method: string): AuditAction | undefined {
	switch (method.toUpperCase()) {
		case 'GET':
			return AuditAction.READ;
		case 'POST':
			return AuditAction.CREATE;
		case 'PUT':
		case 'PATCH':
			return AuditAction.UPDATE;
		case 'DELETE':
			return AuditAction.DELETE;
		default:
			return undefined;
	}
}

/**
 * Who made the request, from the verified token on `request.user` (set by
 * AuthGuard). Contact details on the token (email, phone) are left out.
 */
export function actorFromRequest(
	user: Record<string, unknown> | undefined,
	userType: UserType | undefined,
): AuditActor {
	if (!user) return { kind: AuditActorKind.ANONYMOUS };

	const str = (value: unknown) =>
		typeof value === 'string' && value ? value : undefined;
	const userId = str(user.sub) ?? str(user.uid);

	if (
		userType === UserType.CHRONIC_CARE ||
		user.aud === UserType.CHRONIC_CARE
	) {
		return {
			kind: AuditActorKind.PERSONNEL,
			userType: UserType.CHRONIC_CARE,
			userId,
			personnelId: userId,
			role: str(user.role),
			facilityId: str(user.facility),
		};
	}
	return {
		kind: AuditActorKind.PATIENT,
		userType: userType ?? str(user.aud),
		userId,
	};
}

/**
 * Whether a request is audited:
 * - the public auth endpoints (login, OTP, signup, onboarding), always
 * - any write (POST/PUT/PATCH/DELETE) by an authenticated user
 * - a personnel GET on a route that reads patient health data
 * - a full data export (`.../data-export`) by anyone, patients included,
 *   recorded as EXPORT
 *
 * Unauthenticated traffic otherwise (health check, public facility lists,
 * the USSD callback) is not audited; Swagger isn't a Nest route at all.
 */
/** Last path segment of the full patient data export routes. */
const DATA_EXPORT_SEGMENT = 'data-export';

export function auditActionFor(
	method: string,
	route: string,
	actor: AuditActor,
): AuditAction | undefined {
	const event = authEvent(method, route);
	if (event) return event.action;

	if (actor.kind === AuditActorKind.ANONYMOUS) return undefined;

	const action = actionForMethod(method);
	if (!action) return undefined;
	if (action !== AuditAction.READ) return action;

	if (staticSegments(route).at(-1) === DATA_EXPORT_SEGMENT) {
		return AuditAction.EXPORT;
	}

	const readsPatientData = staticSegments(route).some((segment) =>
		PATIENT_DATA_SEGMENTS.has(segment),
	);
	return actor.kind === AuditActorKind.PERSONNEL && readsPatientData
		? action
		: undefined;
}

/**
 * On a public auth route there is no `request.user`; fill in who it was
 * from the ids the handler returned. Only ids are read from the response
 * (never tokens or anything else), and only on success.
 */
export function actorForAuthEvent(
	method: string,
	route: string,
	actor: AuditActor,
	responseBody: unknown,
): AuditActor {
	const event = authEvent(method, route);
	if (!event) return actor;

	const data = (responseBody as { data?: unknown } | undefined)?.data;
	const next: AuditActor = { ...actor };
	if (next.kind === AuditActorKind.ANONYMOUS) {
		next.kind = event.kind;
		next.userType =
			event.kind === AuditActorKind.PERSONNEL
				? UserType.CHRONIC_CARE
				: UserType.DH_CLIENTS;
	}

	if (event.kind === AuditActorKind.PERSONNEL) {
		// Login returns { personnelId, token }; signup and onboarding return
		// the personnel id itself (an ObjectId). OTP routes return nothing.
		const personnelId =
			cleanId((data as { personnelId?: unknown } | undefined)?.personnelId) ??
			cleanId(data);
		if (personnelId) {
			next.userId ??= personnelId;
			next.personnelId ??= personnelId;
		}
	} else if (event.action === AuditAction.SIGNUP) {
		// Patient signup returns the new Firebase uid.
		next.userId ??= cleanId(data);
	} else if (event.action === AuditAction.ONBOARD) {
		// Patient onboarding returns the patient record id.
		next.patientId ??= cleanId(data);
	}
	return next;
}

export function requestIdFrom(
	headers: AuditRequest['headers'],
): string | undefined {
	for (const name of ['x-request-id', 'x-railway-request-id']) {
		const value = headers[name];
		if (typeof value === 'string' && REQUEST_ID_PATTERN.test(value)) {
			return value;
		}
	}
	return undefined;
}

export function userAgentFrom(
	headers: AuditRequest['headers'],
): string | undefined {
	const value = headers['user-agent'];
	return typeof value === 'string' && value
		? value.slice(0, USER_AGENT_MAX)
		: undefined;
}

export function outcomeFor(statusCode: number): AuditOutcome {
	return statusCode < 400 ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE;
}

/** Builds the stored entry. Only the fields listed here are ever written. */
export function buildAuditEntry(input: {
	request: AuditRequest;
	route: string;
	action: AuditAction;
	actor: AuditActor;
	/** Omitted for an aborted request (no response was sent). */
	statusCode?: number;
	/** Defaults to the outcome implied by the status code. */
	outcome?: AuditOutcome;
	now?: Date;
}): AuditLog {
	const { request, route, action, actor, statusCode } = input;
	return {
		timestamp: input.now ?? new Date(),
		actor,
		action,
		method: request.method.toUpperCase(),
		route,
		...extractResource(route, request.params),
		statusCode,
		outcome:
			input.outcome ??
			(statusCode === undefined
				? AuditOutcome.ABORTED
				: outcomeFor(statusCode)),
		ip: request.ip,
		userAgent: userAgentFrom(request.headers),
		requestId: requestIdFrom(request.headers),
	};
}
