import { Test, TestingModule } from '@nestjs/testing';
import { DisquisitionerService } from './disquisitioner.service';

describe('DisquisitionerService', () => {
	let service: DisquisitionerService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [DisquisitionerService],
		}).compile();

		service = module.get<DisquisitionerService>(DisquisitionerService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
