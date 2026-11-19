import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const AUDIT_LOG_COLLECTION = 'audit_logs';
/** Name of the TTL index on `timestamp` (created by AuditService). */
export const AUDIT_LOG_TTL_INDEX = 'timestamp_ttl';

export enum AuditAction {
	CREATE = 'CREATE',
	READ = 'READ',
	UPDATE = 'UPDATE',
	DELETE = 'DELETE',
	LOGIN = 'LOGIN',
	SIGNUP = 'SIGNUP',
	ONBOARD = 'ONBOARD',
	OTP_SEND = 'OTP_SEND',
	OTP_VERIFY = 'OTP_VERIFY',
	/** Rejected by AuthGuard/RolesGuard (401/403) before the handler ran. */
	ACCESS_DENIED = 'ACCESS_DENIED',
}

export enum AuditOutcome {
	SUCCESS = 'success',
	FAILURE = 'failure',
	/**
	 * The client disconnected before a response was sent and the handler
	 * then completed: the action ran, but no status reached the client.
	 */
	ABORTED = 'aborted',
}

export enum AuditActorKind {
	PERSONNEL = 'personnel',
	PATIENT = 'patient',
	ANONYMOUS = 'anonymous',
}

@Schema({ _id: false, versionKey: false })
export class AuditActor {
	@Prop({ required: true, enum: AuditActorKind })
	kind: AuditActorKind;

	/** The token audience (`UserType` value), e.g. `dnh`, `dh-clients`. */
	@Prop()
	userType?: string;

	/** Token subject: personnel id for personnel, Firebase uid for patients. */
	@Prop()
	userId?: string;

	/** Personnel role (clinician / pharmacy). */
	@Prop()
	role?: string;

	@Prop()
	personnelId?: string;

	/** Patient record id, when known (e.g. returned by onboarding). */
	@Prop()
	patientId?: string;

	/** Facility the personnel token was issued for. */
	@Prop()
	facilityId?: string;
}

const AuditActorSchema = SchemaFactory.createForClass(AuditActor);

/**
 * One audited request. Deliberately has no field for request or response
 * bodies, query strings, headers other than the user agent, or tokens.
 */
@Schema({
	collection: AUDIT_LOG_COLLECTION,
	versionKey: false,
	timestamps: false,
})
export class AuditLog {
	@Prop({ required: true, default: () => new Date() })
	timestamp: Date;

	@Prop({ type: AuditActorSchema, required: true })
	actor: AuditActor;

	@Prop({ required: true, enum: AuditAction })
	action: AuditAction;

	@Prop({ required: true })
	method: string;

	/** Matched route template, e.g. `/api/v1/hcp/patients/:id` (no ids, no query). */
	@Prop({ required: true })
	route: string;

	@Prop()
	resourceType?: string;

	@Prop()
	resourceId?: string;

	/** The patient whose data the request touched, when the route names one. */
	@Prop()
	patientId?: string;

	/** Absent when the outcome is `aborted` (no response was sent). */
	@Prop()
	statusCode?: number;

	@Prop({ required: true, enum: AuditOutcome })
	outcome: AuditOutcome;

	@Prop()
	ip?: string;

	@Prop()
	userAgent?: string;

	@Prop()
	requestId?: string;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// `timestamp` is covered by the TTL index AuditService creates at startup
// (its expiry comes from AUDIT_LOG_TTL_DAYS, which a schema index can't
// update in place once it exists).
AuditLogSchema.index({ 'actor.userId': 1, timestamp: -1 });
AuditLogSchema.index({ resourceId: 1, timestamp: -1 });
AuditLogSchema.index({ patientId: 1, timestamp: -1 });
