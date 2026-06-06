import { Test, TestingModule } from '@nestjs/testing';
import { ConcernsService } from './concerns.service';

describe('ConcernsService', () => {
	let service: ConcernsService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [ConcernsService],
		}).compile();

		service = module.get<ConcernsService>(ConcernsService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
