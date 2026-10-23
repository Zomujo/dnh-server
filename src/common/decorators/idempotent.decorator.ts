import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { IdempotencyInterceptor } from '@/common/interceptors/idempotency.interceptor';

export const IdempotencyKeyHeaderDoc = ApiHeader({
	name: 'Idempotency-Key',
	required: false,
	description:
		'Optional client-generated key (e.g. a UUID v4). Retrying with the same key and body replays the first response (48 h) instead of creating a duplicate; a different body returns 422 IDEMPOTENCY_KEY_REUSED, and a retry while the first is still running returns 409.',
});

/** Opt a create endpoint into Idempotency-Key handling. */
export function Idempotent() {
	return applyDecorators(
		UseInterceptors(IdempotencyInterceptor),
		IdempotencyKeyHeaderDoc,
	);
}
