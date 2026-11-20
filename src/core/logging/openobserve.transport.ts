/**
 * Sends log records to OpenObserve's JSON ingestion API in batches:
 *   POST <url>/api/<org>/<stream>/_json  (HTTP Basic, service account + token)
 *
 * Logging must never take the API down or slow a request, so records are
 * queued in memory and sent every few seconds. A failed send drops that batch
 * and reports it on stderr (at most once a minute); a full queue drops the
 * oldest records. Nothing here throws.
 */

export interface OpenObserveConfig {
	/** Base URL, e.g. http://openobserve:5080 (no trailing slash). */
	url: string;
	/** Organization: one per environment (staging, production). */
	org: string;
	stream: string;
	user: string;
	token: string;
	/** Added to every record so the source is clear in the UI. */
	environment: string;
	flushIntervalMs?: number;
	/** Records per request. */
	maxBatch?: number;
	/** Records held while OpenObserve is unreachable; the oldest are dropped. */
	maxQueue?: number;
	requestTimeoutMs?: number;
}

export interface LogRecord {
	level: string;
	message: string;
	context?: string;
	stack?: string;
}

/** Longest message or stack kept, so one huge error can't fill a batch. */
const MAX_FIELD_LENGTH = 16_000;
const REPORT_EVERY_MS = 60_000;

export class OpenObserveTransport {
	private readonly endpoint: string;
	private readonly authorization: string;
	private readonly flushIntervalMs: number;
	private readonly maxBatch: number;
	private readonly maxQueue: number;
	private readonly requestTimeoutMs: number;
	private queue: Record<string, unknown>[] = [];
	private timer?: NodeJS.Timeout;
	private sending?: Promise<void>;
	private dropped = 0;
	private lastReportAt = 0;

	constructor(
		private readonly config: OpenObserveConfig,
		private readonly fetchImpl: typeof fetch = fetch,
		private readonly reportProblem: (line: string) => void = (line) =>
			process.stderr.write(`${line}\n`),
	) {
		const base = config.url.replace(/\/+$/, '');
		this.endpoint = `${base}/api/${encodeURIComponent(config.org)}/${encodeURIComponent(config.stream)}/_json`;
		this.authorization = `Basic ${Buffer.from(`${config.user}:${config.token}`).toString('base64')}`;
		this.flushIntervalMs = config.flushIntervalMs ?? 2_000;
		this.maxBatch = config.maxBatch ?? 200;
		this.maxQueue = config.maxQueue ?? 5_000;
		this.requestTimeoutMs = config.requestTimeoutMs ?? 5_000;
	}

	send(record: LogRecord): void {
		this.queue.push({
			_timestamp: Date.now() * 1000,
			service: 'dnh-api',
			environment: this.config.environment,
			level: record.level,
			message: truncate(record.message),
			...(record.context ? { context: record.context } : {}),
			...(record.stack ? { stack: truncate(record.stack) } : {}),
		});
		if (this.queue.length > this.maxQueue) {
			const excess = this.queue.length - this.maxQueue;
			this.queue.splice(0, excess);
			this.dropped += excess;
		}
		if (this.queue.length >= this.maxBatch) {
			void this.flush();
		} else {
			this.schedule();
		}
	}

	/** Sends everything queued; resolves once done. Never rejects. */
	async flush(): Promise<void> {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		// One request at a time keeps records in order and bounds concurrency.
		while (this.sending) await this.sending;
		if (this.queue.length === 0) return;

		const batch = this.queue.splice(0, this.maxBatch);
		this.sending = this.post(batch).finally(() => {
			this.sending = undefined;
		});
		await this.sending;
		if (this.queue.length > 0) await this.flush();
	}

	/** Stops the timer and sends what is left; for application shutdown. */
	async close(): Promise<void> {
		await this.flush();
	}

	private schedule() {
		if (this.timer) return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.flush();
		}, this.flushIntervalMs);
		// A pending log send must not keep the process alive.
		this.timer.unref();
	}

	private async post(batch: Record<string, unknown>[]): Promise<void> {
		try {
			const response = await this.fetchImpl(this.endpoint, {
				method: 'POST',
				headers: {
					authorization: this.authorization,
					'content-type': 'application/json',
				},
				body: JSON.stringify(batch),
				signal: AbortSignal.timeout(this.requestTimeoutMs),
			});
			if (!response.ok) {
				this.fail(batch.length, `HTTP ${response.status}`);
				return;
			}
		} catch (error) {
			this.fail(batch.length, (error as Error)?.message ?? String(error));
			return;
		}
		if (this.dropped > 0) this.report();
	}

	private fail(count: number, reason: string) {
		this.dropped += count;
		this.report(reason);
	}

	/** At most one stderr line a minute, so an outage can't flood the console. */
	private report(reason?: string) {
		const now = Date.now();
		if (now - this.lastReportAt < REPORT_EVERY_MS) return;
		this.lastReportAt = now;
		const dropped = this.dropped;
		this.dropped = 0;
		this.reportProblem(
			reason
				? `[OpenObserve] could not send logs to ${this.endpoint} (${reason}); ${dropped} record(s) dropped. They are still in the container log.`
				: `[OpenObserve] sending again; ${dropped} record(s) were dropped while it was unreachable.`,
		);
	}
}

/**
 * The transport for this process, or null when OpenObserve isn't configured
 * (development, or a deployment without it: logs then stay in the console).
 */
export function createOpenObserveTransport(
	env: NodeJS.ProcessEnv = process.env,
): OpenObserveTransport | null {
	const url = env.OPENOBSERVE_URL?.trim();
	const user = env.OPENOBSERVE_USER?.trim();
	const token = env.OPENOBSERVE_TOKEN?.trim();
	if (!url || !user || !token) return null;
	const environment = env.NODE_ENV?.trim() || 'unknown';
	return new OpenObserveTransport({
		url,
		user,
		token,
		environment,
		org: env.OPENOBSERVE_ORG?.trim() || environment,
		stream: env.OPENOBSERVE_STREAM?.trim() || 'api',
	});
}

/** Turns whatever was logged into text: errors keep their message, objects become JSON. */
export function stringifyLogMessage(message: unknown): string {
	if (typeof message === 'string') return message;
	if (message instanceof Error) return `${message.name}: ${message.message}`;
	try {
		return JSON.stringify(message) ?? String(message);
	} catch {
		return String(message);
	}
}

function truncate(text: string): string {
	return text.length > MAX_FIELD_LENGTH
		? `${text.slice(0, MAX_FIELD_LENGTH)}… [truncated ${text.length - MAX_FIELD_LENGTH} chars]`
		: text;
}
