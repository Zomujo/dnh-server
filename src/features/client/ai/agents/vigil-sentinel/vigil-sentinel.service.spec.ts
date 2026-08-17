import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep } from 'vitest-mock-extended';
import { PushService } from '@/features/notifications/push/push.service';
import { PatientsService } from '@/features/patients/patients.service';
import { VigilSentinelService } from './vigil-sentinel.service';

describe('VigilSentinelService', () => {
	let service: VigilSentinelService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				VigilSentinelService,
				{ provide: PatientsService, useValue: mockDeep<PatientsService>() },
				{ provide: PushService, useValue: mockDeep<PushService>() },
			],
		}).compile();

		service = module.get<VigilSentinelService>(VigilSentinelService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
