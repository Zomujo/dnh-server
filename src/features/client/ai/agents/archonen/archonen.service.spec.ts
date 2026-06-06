import { Test, TestingModule } from '@nestjs/testing';
import { ArchonenService } from './archonen.service';

describe('ArchonenService', () => {
	let service: ArchonenService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [ArchonenService],
		}).compile();

		service = module.get<ArchonenService>(ArchonenService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
