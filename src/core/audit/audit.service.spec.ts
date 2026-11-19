import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import { AuditService } from './audit.service';
import {
	AUDIT_LOG_TTL_INDEX,
	AuditAction,
	AuditActorKind,
	type AuditLog,
	AuditOutcome,
} from './entities/audit-log.entity';

const entry: AuditLog = {
	timestamp: new Date(),
	actor: { kind: AuditActorKind.ANONYMOUS },
	action: AuditAction.LOGIN,
	method: 'POST',
	route: '/api/v1/personnel/auth/login',
	statusCode: 401,
	outcome: AuditOutcome.FAILURE,
};

function setup(ttl?: string) {
	// A plain stub: the model's surface used here is create, collection and
	// db. (A deep mock of Mongoose's Model type is very costly for tsc.)
	const command = vi.fn().mockResolvedValue({ ok: 1 });
	const collection = {
		collectionName: 'audit_logs',
		createIndex: vi.fn(),
		dropIndex: vi.fn(),
		indexes: vi.fn(),
	};
	const model = {
		create: vi.fn(),
		collection,
		db: { db: { command } },
	};
	const config = {
		get: vi.fn().mockReturnValue(ttl),
	} as unknown as ConfigService;
	const service = new AuditService(model as unknown as Model<AuditLog>, config);
	return {
		service,
		model,
		command,
		createIndex: collection.createIndex,
		dropIndex: collection.dropIndex,
		indexes: collection.indexes,
	};
}

describe('AuditService', () => {
	beforeEach(() => {
		vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
		vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
		vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
	});
	afterEach(() => vi.restoreAllMocks());

	it('reads the retention from AUDIT_LOG_TTL_DAYS', () => {
		expect(setup().service.ttlDays).toBe(730);
		expect(setup('90').service.ttlDays).toBe(90);
		expect(setup('nonsense').service.ttlDays).toBe(730);
	});

	it('writes without waiting and swallows a rejected write', async () => {
		const { service, model } = setup();
		model.create.mockRejectedValue(new Error('mongo down'));

		expect(service.record(entry)).toBeUndefined();
		await new Promise((resolve) => setImmediate(resolve));

		expect(model.create).toHaveBeenCalledWith(entry);
		expect(Logger.prototype.error).toHaveBeenCalled();
	});

	it('swallows a synchronous throw from the model', () => {
		const { service, model } = setup();
		model.create.mockImplementation(() => {
			throw new Error('not connected');
		});
		expect(() => service.record(entry)).not.toThrow();
	});

	it('creates the TTL index with the configured expiry', async () => {
		const { service, createIndex } = setup('30');
		await service.ensureTtlIndex();
		expect(createIndex).toHaveBeenCalledWith(
			{ timestamp: 1 },
			{ name: AUDIT_LOG_TTL_INDEX, expireAfterSeconds: 30 * 86_400 },
		);
	});

	it('updates the expiry in place when the index already exists', async () => {
		const { service, createIndex, command } = setup('365');
		createIndex.mockRejectedValue(
			Object.assign(new Error('IndexOptionsConflict'), { code: 85 }),
		);
		await service.ensureTtlIndex();
		expect(command).toHaveBeenCalledWith({
			collMod: 'audit_logs',
			index: {
				name: AUDIT_LOG_TTL_INDEX,
				expireAfterSeconds: 365 * 86_400,
			},
		});
	});

	it('drops and recreates the index when collMod is refused (readWrite-only user)', async () => {
		const { service, createIndex, dropIndex, command } = setup('365');
		createIndex
			.mockRejectedValueOnce(
				Object.assign(new Error('IndexOptionsConflict'), { code: 85 }),
			)
			.mockResolvedValueOnce('timestamp_ttl');
		command.mockRejectedValue(
			Object.assign(new Error('not authorized'), { code: 13 }),
		);

		await service.ensureTtlIndex();

		expect(dropIndex).toHaveBeenCalledWith(AUDIT_LOG_TTL_INDEX);
		expect(createIndex).toHaveBeenLastCalledWith(
			{ timestamp: 1 },
			{ name: AUDIT_LOG_TTL_INDEX, expireAfterSeconds: 365 * 86_400 },
		);
		expect(Logger.prototype.log).toHaveBeenCalledWith(
			'Audit log retention updated to 365 days',
		);
	});

	it('logs the retention still in force when the index cannot be changed', async () => {
		const { service, createIndex, dropIndex, command, indexes } = setup('365');
		createIndex.mockRejectedValue(
			Object.assign(new Error('IndexOptionsConflict'), { code: 85 }),
		);
		command.mockRejectedValue(new Error('not authorized'));
		dropIndex.mockRejectedValue(new Error('not authorized'));
		indexes.mockResolvedValue([
			{ name: AUDIT_LOG_TTL_INDEX, expireAfterSeconds: 730 * 86_400 },
		]);

		await expect(service.ensureTtlIndex()).resolves.toBeUndefined();
		expect(Logger.prototype.error).toHaveBeenCalledWith(
			'Audit log retention still in force: 730 days (wanted 365)',
		);
	});

	it('logs other index errors without throwing', async () => {
		const { service, createIndex, command } = setup();
		createIndex.mockRejectedValue(new Error('network'));
		await expect(service.ensureTtlIndex()).resolves.toBeUndefined();
		expect(command).not.toHaveBeenCalled();
	});
});
