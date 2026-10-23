import { randomUUID } from 'node:crypto';
import {
	Body,
	CanActivate,
	Controller,
	ExecutionContext,
	INestApplication,
	Injectable,
	Post,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Idempotent } from '@/common/decorators';
import { IdempotencyStore } from '@/core/caching/idempotency.store';

// A1 "done when": the same vital POSTed twice with one Idempotency-Key
// yields one document and the same id. Uses the real interceptor and the
// Redis store (REDIS_URL); the route is a stand-in for the vitals endpoint.

const documents: { id: string; value: string }[] = [];

@Controller('vitals')
class VitalsController {
	@Post()
	@Idempotent()
	create(@Body() body: { value: string }) {
		const doc = { id: randomUUID(), value: body.value };
		documents.push(doc);
		return { data: { id: doc.id } };
	}
}

@Injectable()
class HeaderUserGuard implements CanActivate {
	canActivate(context: ExecutionContext) {
		const req = context.switchToHttp().getRequest();
		req.user = { sub: req.headers['x-user'] };
		return true;
	}
}

describe('Idempotency-Key (e2e)', () => {
	let app: INestApplication;
	const user = `e2e-${randomUUID()}`;

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [ConfigModule.forRoot({ isGlobal: true })],
			controllers: [VitalsController],
			providers: [
				IdempotencyStore,
				{ provide: APP_GUARD, useClass: HeaderUserGuard },
			],
		}).compile();
		app = moduleRef.createNestApplication();
		await app.init();
	});

	afterAll(async () => {
		await app?.close();
	});

	const post = (key: string, value: string, as = user) =>
		request(app.getHttpServer())
			.post('/vitals')
			.set('x-user', as)
			.set('Idempotency-Key', key)
			.send({ value });

	it('stores one document and returns the same id for a retried vital', async () => {
		const key = randomUUID();
		const first = await post(key, '120/80').expect(201);
		const retry = await post(key, '120/80').expect(201);

		expect(retry.body.data.id).toBe(first.body.data.id);
		expect(retry.headers['idempotent-replayed']).toBe('true');
		expect(documents.filter((d) => d.id === first.body.data.id)).toHaveLength(
			1,
		);
	});

	it('rejects the same key with a different body', async () => {
		const key = randomUUID();
		await post(key, '120/80').expect(201);
		const reused = await post(key, '140/90').expect(422);
		expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
	});

	it('scopes keys to the user', async () => {
		const key = randomUUID();
		const mine = await post(key, '120/80').expect(201);
		const theirs = await post(key, '120/80', `e2e-${randomUUID()}`).expect(201);
		expect(theirs.body.data.id).not.toBe(mine.body.data.id);
	});
});
