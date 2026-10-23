import { createHash } from 'node:crypto';
import {
	BadRequestException,
	CallHandler,
	ConflictException,
	ExecutionContext,
	Injectable,
	Logger,
	NestInterceptor,
	UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { IdempotencyStore } from '@/core/caching/idempotency.store';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
/** How long a completed response is replayed for. */
const REPLAY_TTL_MS = 48 * 60 * 60 * 1000;
/**
 * How long an in-flight claim blocks the key. Longer than the slowest
 * handler (LLM chat, transcription), short enough that a crashed request
 * doesn't block retries for long.
 */
const IN_FLIGHT_TTL_MS = 5 * 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Makes a create endpoint safe to retry with an `Idempotency-Key` header:
 *
 * - no header: runs as usual
 * - same key + same request: replays the stored status and body without
 *   running the handler (so no duplicate row, LLM call or push)
 * - same key + different request: 422 IDEMPOTENCY_KEY_REUSED
 * - same key while the first is still running: 409 IDEMPOTENCY_REQUEST_IN_PROGRESS
 *
 * Keys are scoped per user. A request that fails releases its key, so a
 * retry runs again; only successful responses are replayed.
 *
 * Apply with `@Idempotent()`, or list it after FileInterceptor on
 * multipart routes so the uploaded file is part of the request hash.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
	private readonly logger = new Logger(IdempotencyInterceptor.name);

	constructor(private readonly store: IdempotencyStore) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const http = context.switchToHttp();
		const request = http.getRequest<Request & { user?: any }>();
		const response = http.getResponse<Response>();

		const header = request.headers[IDEMPOTENCY_HEADER];
		if (header === undefined) return next.handle();

		const key = typeof header === 'string' ? header.trim() : '';
		if (!KEY_PATTERN.test(key)) {
			throw new BadRequestException({
				statusCode: 400,
				error: 'Bad Request',
				code: 'IDEMPOTENCY_KEY_INVALID',
				message:
					'Idempotency-Key must be 8-128 characters of A-Z, a-z, 0-9, - or _',
			});
		}

		const userId: string | undefined = request.user?.sub ?? request.user?.uid;
		// Only used on authorized routes; without a user there is no scope.
		if (!userId) return next.handle();

		const storeKey = `idempotency:${userId}:${key}`;
		const requestHash = hashRequest(request);

		return from(this.claim(storeKey, requestHash)).pipe(
			mergeMap((replay) => {
				if (replay) {
					response.status(replay.status);
					response.setHeader('Idempotent-Replayed', 'true');
					return of(replay.body);
				}
				return next.handle().pipe(
					mergeMap(async (body) => {
						await this.store
							.save(
								storeKey,
								{
									state: 'done',
									requestHash,
									status: response.statusCode,
									body,
								},
								REPLAY_TTL_MS,
							)
							.catch((error) => {
								this.logger.error(
									`Could not store idempotent response: ${error?.message}`,
								);
								return this.store.release(storeKey).catch(() => undefined);
							});
						return body;
					}),
					catchError((error) =>
						from(this.store.release(storeKey).catch(() => undefined)).pipe(
							mergeMap(() => throwError(() => error)),
						),
					),
				);
			}),
		);
	}

	/** Claims the key, or returns the response to replay. */
	private async claim(storeKey: string, requestHash: string) {
		for (let attempt = 0; attempt < 2; attempt++) {
			if (
				await this.store.acquire(
					storeKey,
					{ state: 'pending', requestHash },
					IN_FLIGHT_TTL_MS,
				)
			) {
				return null;
			}

			const existing = await this.store.get(storeKey);
			// Released or expired between the two calls: try to claim again.
			if (!existing) continue;

			if (existing.requestHash !== requestHash) {
				throw new UnprocessableEntityException({
					statusCode: 422,
					error: 'Unprocessable Entity',
					code: 'IDEMPOTENCY_KEY_REUSED',
					message:
						'This Idempotency-Key was already used for a different request',
				});
			}
			if (existing.state === 'pending') {
				throw new ConflictException({
					statusCode: 409,
					error: 'Conflict',
					code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
					message:
						'A request with this Idempotency-Key is still being processed',
				});
			}
			return existing;
		}
		throw new ConflictException({
			statusCode: 409,
			error: 'Conflict',
			code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
			message: 'A request with this Idempotency-Key is still being processed',
		});
	}
}

/** Same route + query + body (+ file bytes) => same hash, key order aside. */
export function hashRequest(
	request: Pick<Request, 'method' | 'query' | 'body'> & {
		route?: { path?: string };
		path?: string;
		file?: { buffer?: Buffer };
	},
) {
	const fileDigest = request.file?.buffer
		? createHash('sha256').update(request.file.buffer).digest('hex')
		: undefined;
	return createHash('sha256')
		.update(
			canonicalJson({
				method: request.method,
				route: request.route?.path ?? request.path,
				query: request.query ?? {},
				body: request.body ?? {},
				file: fileDigest,
			}),
		)
		.digest('hex');
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value && typeof value === 'object') {
		const entries = Object.keys(value as Record<string, unknown>)
			.filter((k) => (value as Record<string, unknown>)[k] !== undefined)
			.sort()
			.map(
				(k) =>
					`${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`,
			);
		return `{${entries.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}
