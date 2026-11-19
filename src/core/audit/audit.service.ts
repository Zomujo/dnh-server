import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { resolveAuditTtlDays, ttlDaysToSeconds } from './audit.config';
import { AUDIT_LOG_TTL_INDEX, AuditLog } from './entities/audit-log.entity';

/** Mongo's "index exists with different options" error. */
const INDEX_OPTIONS_CONFLICT = 85;

@Injectable()
export class AuditService implements OnModuleInit {
	private readonly logger = new Logger(AuditService.name);
	readonly ttlDays: number;

	constructor(
		@InjectModel(AuditLog.name) private readonly auditLogModel: Model<AuditLog>,
		configService: ConfigService,
	) {
		const raw = configService.get<string>('AUDIT_LOG_TTL_DAYS');
		this.ttlDays = resolveAuditTtlDays(raw);
		if (raw?.trim() && String(this.ttlDays) !== raw.trim()) {
			this.logger.warn(
				`AUDIT_LOG_TTL_DAYS is not a whole number of days between 1 and 36500; using ${this.ttlDays}.`,
			);
		}
	}

	onModuleInit() {
		// Not awaited: an index problem must not stop the app from starting.
		void this.ensureTtlIndex();
	}

	/**
	 * Writes one entry without blocking the caller. Errors are logged and
	 * swallowed: a failed audit write never fails or delays the request.
	 */
	record(entry: AuditLog): void {
		try {
			this.auditLogModel.create(entry).catch((error: unknown) => {
				this.logger.error(
					`Could not write audit log for ${entry.method} ${entry.route}`,
					error instanceof Error ? error.stack : String(error),
				);
			});
		} catch (error) {
			this.logger.error(
				`Could not write audit log for ${entry.method} ${entry.route}`,
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	/**
	 * Creates the TTL index on `timestamp`, or changes its expiry when
	 * AUDIT_LOG_TTL_DAYS has changed since it was created: in place with
	 * collMod (needs dbAdmin), or, when that is refused (e.g. a readWrite-only
	 * user), by dropping and recreating the index. Logs the retention in force.
	 */
	async ensureTtlIndex(): Promise<void> {
		const expireAfterSeconds = ttlDaysToSeconds(this.ttlDays);
		const collection = this.auditLogModel.collection;
		const create = () =>
			collection.createIndex(
				{ timestamp: 1 },
				{ name: AUDIT_LOG_TTL_INDEX, expireAfterSeconds },
			);

		try {
			await create();
			this.logger.log(`Audit log retention: ${this.ttlDays} days`);
			return;
		} catch (error) {
			if ((error as { code?: number }).code !== INDEX_OPTIONS_CONFLICT) {
				this.logFailure('Could not create the audit log TTL index', error);
				return;
			}
		}

		try {
			await this.auditLogModel.db.db?.command({
				collMod: collection.collectionName,
				index: { name: AUDIT_LOG_TTL_INDEX, expireAfterSeconds },
			});
			this.logger.log(`Audit log retention updated to ${this.ttlDays} days`);
			return;
		} catch (error) {
			this.logger.warn(
				`collMod on ${collection.collectionName} was refused (${(error as Error)?.message}); recreating the TTL index instead`,
			);
		}

		try {
			await collection.dropIndex(AUDIT_LOG_TTL_INDEX);
			await create();
			this.logger.log(`Audit log retention updated to ${this.ttlDays} days`);
		} catch (error) {
			this.logFailure('Could not recreate the audit log TTL index', error);
			await this.logRetentionInForce();
		}
	}

	/** After a failed update, says which retention (if any) still applies. */
	private async logRetentionInForce() {
		try {
			const indexes = await this.auditLogModel.collection.indexes();
			const ttl = indexes.find((index) => index.name === AUDIT_LOG_TTL_INDEX);
			const seconds = ttl?.expireAfterSeconds;
			this.logger.error(
				seconds === undefined
					? 'Audit logs currently have NO retention limit (TTL index missing)'
					: `Audit log retention still in force: ${seconds / 86_400} days (wanted ${this.ttlDays})`,
			);
		} catch (error) {
			this.logFailure('Could not read the audit log indexes', error);
		}
	}

	private logFailure(message: string, error: unknown) {
		this.logger.error(
			message,
			error instanceof Error ? error.stack : String(error),
		);
	}
}
