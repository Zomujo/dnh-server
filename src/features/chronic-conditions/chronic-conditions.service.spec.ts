import { Test, TestingModule } from '@nestjs/testing';
import { ChronicConditionsService } from './chronic-conditions.service';

describe('ChronicConditionsService', () => {
	let service: ChronicConditionsService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [ChronicConditionsService],
		}).compile();

		service = module.get<ChronicConditionsService>(ChronicConditionsService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
