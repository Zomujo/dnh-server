import { Test, TestingModule } from '@nestjs/testing';
import { RequiemService } from './requiem.service';

describe('RequiemService', () => {
	let service: RequiemService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [RequiemService],
		}).compile();

		service = module.get<RequiemService>(RequiemService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
