// import type { RedisClientOptions } from '@keyv/redis';
// import KeyvRedis, { Keyv } from '@keyv/redis';
// import type { RunnableConfig } from '@langchain/core/runnables';
// import { BaseCheckpointSaver } from '@langchain/langgraph';
// import type {
// 	Checkpoint,
// 	CheckpointListOptions,
// 	CheckpointMetadata,
// 	CheckpointTuple,
// 	PendingWrite,
// 	SerializerProtocol,
// } from '@langchain/langgraph-checkpoint';
// import Redis from 'ioredis';
//
// import { zip } from '../helpers/zip.helper';
// import {
// 	filterKeys,
// 	loadWrites,
// 	makeRedisCheckpointKey,
// 	makeRedisCheckpointWritesKey,
// 	parseRedisCheckpointData,
// 	parseRedisCheckpointKey,
// 	parseRedisCheckpointWritesKey,
// } from './base.utils';

// export class RedisSaver extends BaseCheckpointSaver {
// 	deleteThread(_threadId: string): Promise<void> {
// 		throw new Error('Method not implemented.');
// 	}
// 	private zypmindNameSpace: string = '';
// 	private redisConnection: RedisClientOptions;
// 	private redis: Redis;
//
// 	constructor(
// 		_redisConnection: RedisClientOptions,
// 		serde?: SerializerProtocol,
// 	) {
// 		super(serde);
// 		this.redis = new Redis(_redisConnection.url as string);
// 		this.redisConnection = _redisConnection;
// 	}
//
// 	get redisStore() {
// 		const keyVRedis = new KeyvRedis(this.redisConnection);
// 		const keyv = new Keyv({
// 			store: keyVRedis,
// 			namespace: this.zypmindNameSpace,
// 		});
// 		return keyv;
// 	}
//
// 	get redisClient() {
// 		return this.redis;
// 	}
//
// 	//   _getPendingSends(
// 	//     threadId: string,
// 	//     checkpointNs: string,
// 	//     parentCheckpointId?: string,
// 	//   ): Promise<SendProtocol[]> {}
//
// 	async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
// 		const {
// 			thread_id,
// 			checkpoint_ns = '',
// 			checkpoint_id,
// 		} = config.configurable ?? {};
// 		const checkpointKey =
// 			(await this.getCheckpointKey(thread_id, checkpoint_ns, checkpoint_id)) ||
// 			'';
// 		if (!checkpointKey) {
// 			return undefined;
// 		}
//
// 		const checkpointData = await this.redisStore.get(checkpointKey);
// 		const checkpointId =
// 			checkpoint_id || parseRedisCheckpointKey(checkpointKey).checkpoint_id;
//
// 		const pendingWrites = await this.loadPendingWrites(
// 			thread_id,
// 			checkpoint_ns,
// 			checkpointId,
// 		);
//
// 		return parseRedisCheckpointData(
// 			this.serde,
// 			checkpointKey,
// 			checkpointData,
// 			pendingWrites,
// 		);
// 	}
//
// 	private async getCheckpointKey(
// 		threadId: string,
// 		checkpointNs: string,
// 		checkpointId: string,
// 	) {
// 		if (checkpointId) {
// 			return makeRedisCheckpointKey(threadId, checkpointNs, checkpointId);
// 		}
// 		const pattern = makeRedisCheckpointKey(threadId, checkpointNs, '*');
// 		const allKeys = await this.redisClient.keys(pattern);
//
// 		if (!allKeys.length) {
// 			return undefined;
// 		}
//
// 		const latestKey = allKeys.reduce((prev, current) => {
// 			const prevKey = parseRedisCheckpointKey(prev.toString()).checkpoint_id;
// 			const currKey = parseRedisCheckpointKey(current.toString()).checkpoint_id;
// 			return currKey > prevKey ? current : prev;
// 		});
//
// 		return latestKey;
// 	}
//
// 	async *list(
// 		config: RunnableConfig,
// 		options?: CheckpointListOptions,
// 	): AsyncGenerator<CheckpointTuple> {
// 		const { limit, before } = options ?? {};
// 		// const query: Record<string, any> = {};
// 		const threadId: string = config?.configurable?.thread_id;
// 		const checkpointNs: string = config?.configurable?.checkpoint_ns || '';
//
// 		const pattern = makeRedisCheckpointKey(threadId, checkpointNs, '*');
// 		const patternedKeys = await this.redisClient.keys(pattern);
// 		const keys = filterKeys(patternedKeys, before, limit);
//
// 		// if (filter) {
// 		//   Object.entries(filter).forEach(([key, value]) => {
// 		//     query[`metadata.${key}`] = value;
// 		//   });
// 		// }
//
// 		for (const key of keys) {
// 			const data = await this.redisStore.get(key);
// 			if (data && data.checkpoint && data.metadata) {
// 				const checkpointId = parseRedisCheckpointKey(key).checkpoint_id;
// 				const pendingWrites = await this.loadPendingWrites(
// 					threadId,
// 					checkpointNs,
// 					checkpointId,
// 				);
// 				yield parseRedisCheckpointData(this.serde, key, data, pendingWrites)!;
// 			}
// 		}
// 	}
//
// 	private async loadPendingWrites(
// 		threadId: string,
// 		checkpointNs: string,
// 		checkpointId: string,
// 	): Promise<PendingWrite[]> {
// 		const writesKey = makeRedisCheckpointWritesKey(
// 			threadId,
// 			checkpointNs,
// 			checkpointId,
// 			'*',
// 			undefined,
// 		);
// 		const matchingKeys = await this.redisClient.keys(writesKey);
// 		const parsedKeys = matchingKeys.map((matchingKey) =>
// 			parseRedisCheckpointWritesKey(matchingKey),
// 		);
// 		const arrayData = zip(matchingKeys, parsedKeys).sort(
// 			(a, b) => parseInt(a[1].idx) - parseInt(b[1].idx),
// 		);
// 		const dataObj: Map<string, any> = new Map();
// 		for (const [key, parsedKey] of arrayData) {
// 			dataObj[`${parsedKey.task_id}|${parsedKey.idx}`] =
// 				await this.redisStore.get(key);
// 		}
//
// 		const pendingWrites = loadWrites(this.serde, dataObj);
// 		return pendingWrites;
// 	}
//
// 	// async put(
// 	// 	config: RunnableConfig,
// 	// 	checkpoint: Checkpoint,
// 	// 	metadata: CheckpointMetadata,
// 	// ): Promise<RunnableConfig> {
// 	// 	const threadId = config.configurable?.thread_id;
// 	// 	const checkpointNs = config.configurable?.checkpoint_ns ?? '';
// 	// 	const checkpointId = checkpoint.id;
// 	// 	const parentCheckpointId = config.configurable?.checkpoint_id;
// 	// 	const key = makeRedisCheckpointKey(threadId, checkpointNs, checkpointId);
// 	// 	if (threadId === undefined) {
// 	// 		throw new Error(
// 	// 			`Failed to put checkpoint. The passed RunnableConfig is missing a required "thread_id" field in its "configurable" property.`,
// 	// 		);
// 	// 	}
// 	// 	const [checkpointType, serializedCheckpoint] =
// 	// 		this.serde.dumpsTyped(checkpoint);
// 	// 	const [metadataType, serializedMetadata] = this.serde.dumpsTyped(metadata);
// 	//
// 	// 	if (checkpointType !== metadataType) {
// 	// 		throw new Error('Mismatched checkpoint and metadata types.');
// 	// 	}
// 	//
// 	// 	const doc = {
// 	// 		parent_checkpoint_id: parentCheckpointId,
// 	// 		type: checkpointType,
// 	// 		checkpoint: serializedCheckpoint,
// 	// 		metadata: serializedMetadata,
// 	// 	};
// 	//
// 	// 	await this.redisStore.set(key, doc);
// 	//
// 	// 	return {
// 	// 		configurable: {
// 	// 			thread_id: threadId,
// 	// 			checkpoint_ns: checkpointNs,
// 	// 			checkpoint_id: checkpointId,
// 	// 		},
// 	// 	} as RunnableConfig;
// 	// }
// 	//
// 	// async putWrites(
// 	// 	config: RunnableConfig,
// 	// 	writes: PendingWrite[],
// 	// 	taskId: string,
// 	// ): Promise<void> {
// 	// 	const threadId = config.configurable?.thread_id;
// 	// 	const checkpointNs = config.configurable?.checkpoint_ns;
// 	// 	const checkpointId = config.configurable?.checkpoint_id;
// 	// 	if (
// 	// 		threadId === undefined ||
// 	// 		checkpointNs === undefined ||
// 	// 		checkpointId === undefined
// 	// 	) {
// 	// 		throw new Error(
// 	// 			`The provided config must contain a configurable field with "thread_id", "checkpoint_ns" and "checkpoint_id" fields.`,
// 	// 		);
// 	// 	}
// 	//
// 	// 	const _operations = await Promise.all(
// 	// 		writes.map(async ([channel, value], idx) => {
// 	// 			const key = makeRedisCheckpointWritesKey(
// 	// 				threadId,
// 	// 				checkpointNs,
// 	// 				checkpointId,
// 	// 				taskId,
// 	// 				idx,
// 	// 			);
// 	// 			const [type, serializedValue] = this.serde.dumpsTyped(value);
// 	// 			const data = {
// 	// 				channel,
// 	// 				type,
// 	// 				value: serializedValue,
// 	// 			};
// 	// 			const cache = {
// 	// 				key,
// 	// 				value: data,
// 	// 			};
// 	// 			return cache;
// 	// 		}),
// 	// 	);
// 	//
// 	// 	// await this.redisStore.setMany(operations);
// 	// 	return;
// 	// }
// }
