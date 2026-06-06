import { Test, TestingModule } from '@nestjs/testing';
import { VigilSentinelService } from './vigil-sentinel.service';

describe('VigilSentinelService', () => {
	let service: VigilSentinelService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [VigilSentinelService],
		}).compile();

		service = module.get<VigilSentinelService>(VigilSentinelService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
