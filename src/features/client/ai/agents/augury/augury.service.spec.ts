import { Test, TestingModule } from '@nestjs/testing';
import { AuguryService } from './augury.service';

describe('AuguryService', () => {
	let service: AuguryService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [AuguryService],
		}).compile();

		service = module.get<AuguryService>(AuguryService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
