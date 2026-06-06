import { Test, TestingModule } from '@nestjs/testing';
import { AdherencesService } from './adherences.service';

describe('AdherencesService', () => {
	let service: AdherencesService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [AdherencesService],
		}).compile();

		service = module.get<AdherencesService>(AdherencesService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
