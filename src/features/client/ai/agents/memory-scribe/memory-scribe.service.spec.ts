import { Test, TestingModule } from '@nestjs/testing';
import { MemoryScribeService } from './memory-scribe.service';

describe('MemoryScribeService', () => {
	let service: MemoryScribeService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [MemoryScribeService],
		}).compile();

		service = module.get<MemoryScribeService>(MemoryScribeService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
