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
	 * Creates the TTL index on `timestamp`, or updates its expiry in place
	 * (collMod) when AUDIT_LOG_TTL_DAYS has changed since it was created.
	 */
	async ensureTtlIndex(): Promise<void> {
		const expireAfterSeconds = ttlDaysToSeconds(this.ttlDays);
		const collection = this.auditLogModel.collection;
		try {
			await collection.createIndex(
				{ timestamp: 1 },
				{ name: AUDIT_LOG_TTL_INDEX, expireAfterSeconds },
			);
		} catch (error) {
			if ((error as { code?: number }).code !== INDEX_OPTIONS_CONFLICT) {
				this.logger.error(
					'Could not create the audit log TTL index',
					error instanceof Error ? error.stack : String(error),
				);
				return;
			}
			try {
				await this.auditLogModel.db.db?.command({
					collMod: collection.collectionName,
					index: { name: AUDIT_LOG_TTL_INDEX, expireAfterSeconds },
				});
				this.logger.log(`Audit log retention updated to ${this.ttlDays} days`);
			} catch (collModError) {
				this.logger.error(
					'Could not update the audit log TTL index',
					collModError instanceof Error
						? collModError.stack
						: String(collModError),
				);
			}
		}
	}
}
