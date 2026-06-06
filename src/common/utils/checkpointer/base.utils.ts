import type { RunnableConfig } from '@langchain/core/runnables';
import type {
	Checkpoint,
	CheckpointTuple,
	PendingWrite,
	SerializerProtocol,
} from '@langchain/langgraph-checkpoint';

import type { CheckPointParams } from './checkpointer.types';

const REDIS_KEY_SEPARATOR = ':';

export function makeRedisCheckpointKey(
	threadId: string,
	checkpointNs: string,
	checkpointId: string,
): string {
	checkpointNs = checkpointNs || 'root';
	return ['checkpoint', threadId, checkpointNs, checkpointId].join(
		REDIS_KEY_SEPARATOR,
	);
}

export function makeRedisCheckpointWritesKey(
	threadId: string,
	checkpointNs: string,
	checkpointId: string,
	taskId: string,
	idx?: number,
): string {
	checkpointNs = checkpointNs || 'root';
	const paramArray = ['writes', threadId, checkpointNs, checkpointId, taskId];
	if (!idx) {
		return paramArray.join(REDIS_KEY_SEPARATOR);
	}
	return [...paramArray, idx].join(REDIS_KEY_SEPARATOR);
}

export function parseRedisCheckpointKey(
	redisKey: string,
): Omit<CheckPointParams, 'task_id' | 'idx'> {
	const [namespace, thread_id, checkpoint_ns, checkpoint_id] =
		redisKey.split(REDIS_KEY_SEPARATOR);
	if (namespace !== 'checkpoint') {
		throw new Error("Expected checkpoint key to start with 'checkpoint'");
	}

	return {
		thread_id,
		checkpoint_ns: checkpoint_ns == 'root' ? '' : checkpoint_ns,
		checkpoint_id,
	};
}

export function parseRedisCheckpointWritesKey(
	redisKey: string,
): CheckPointParams {
	const [namespace, thread_id, checkpoint_ns, checkpoint_id, task_id, idx] =
		redisKey.split(REDIS_KEY_SEPARATOR);

	if (namespace !== 'writes') {
		throw new Error("Expected checkpoint_writes key to start with 'writes'");
	}

	return {
		thread_id,
		checkpoint_ns: checkpoint_ns == 'root' ? '' : checkpoint_ns,
		checkpoint_id,
		task_id,
		idx,
	};
}

export function filterKeys(
	keys: string[],
	before?: RunnableConfig,
	limit?: number,
): string[] {
	if (before) {
		keys = keys.filter(
			(key) =>
				parseRedisCheckpointKey(key).checkpoint_id <
				before.configurable!.checkpoint_id,
		);
	}

	keys.sort((a, b) => {
		const checkpointA = parseRedisCheckpointKey(a).checkpoint_id;
		const checkpointB = parseRedisCheckpointKey(b).checkpoint_id;
		return checkpointB.localeCompare(checkpointA);
	});

	if (limit) {
		keys = keys.slice(0, limit);
	}

	return keys;
}

export function loadWrites(
	serde: SerializerProtocol,
	taskIdToData: Map<string, any>,
): PendingWrite[] {
	const writes: PendingWrite[] = [];

	for (const [_key, value] of Object.entries(
		Object.fromEntries(taskIdToData),
	)) {
		const pendingWrite: PendingWrite = [
			value.channel,
			serde.loadsTyped(value.type, value.value),
		];
		writes.push(pendingWrite);
	}

	return writes;
}

export function parseRedisCheckpointData(
	serde: SerializerProtocol,
	key: string,
	data: Record<string, any>,
	pendingWrites?: PendingWrite[],
): CheckpointTuple | undefined {
	if (!data) return undefined;

	const { thread_id, checkpoint_ns, checkpoint_id } =
		parseRedisCheckpointKey(key);

	const config: RunnableConfig = {
		configurable: { thread_id, checkpoint_ns, checkpoint_id },
	};

	const checkpoint = serde.loadsTyped(
		data.type,
		data.checkpoint,
	) as unknown as Checkpoint;
	const metadata = serde.loadsTyped('json', data.metadata);
	const parentCheckpointId = data.parent_checkpoint_id || null;

	const parentConfig = parentCheckpointId
		? {
				configurable: {
					thread_id,
					checkpoint_ns,
					checkpoint_id: parentCheckpointId,
				},
			}
		: undefined;

	return {
		checkpoint,
		config,
		metadata,
		parentConfig,
		pendingWrites,
	} as unknown as CheckpointTuple;
}
