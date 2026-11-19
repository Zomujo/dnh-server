import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import request from 'supertest';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

describe('PatientsController summary SSE with the AI not configured', () => {
	let app: INestApplication;

	beforeAll(async () => {
		vi.stubEnv('GOOGLE_API_KEY', '');
		const patientsService = {
			// The real check: assertAiConfigured() inside generateSummary.
			generateSummary: (id: string) =>
				PatientsService.prototype.generateSummary.call(
					{
						summaryCacheService: { get: async () => undefined },
					} as unknown as PatientsService,
					id,
				),
		};
		const moduleRef = await Test.createTestingModule({
			controllers: [PatientsController],
			providers: [{ provide: PatientsService, useValue: patientsService }],
		}).compile();
		app = moduleRef.createNestApplication();
		await app.init();
	});

	afterAll(async () => {
		vi.unstubAllEnvs();
		await app.close();
	});

	it('answers a real 503, not a 200 stream with an error event', async () => {
		const res = await request(app.getHttpServer()).get(
			`/personnel/pharmacies/patients/summary/${new Types.ObjectId()}`,
		);

		expect(res.status).toBe(503);
		expect(res.body.message).toBe('AI features are not enabled on this server');
	});
});
