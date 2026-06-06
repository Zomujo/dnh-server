import { Test, TestingModule } from '@nestjs/testing';
import { VitalHistoriesService } from './vital-histories.service';

describe('VitalHistoriesService', () => {
	let service: VitalHistoriesService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [VitalHistoriesService],
		}).compile();

		service = module.get<VitalHistoriesService>(VitalHistoriesService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
