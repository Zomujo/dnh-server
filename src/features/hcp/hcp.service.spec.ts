import { Test, TestingModule } from '@nestjs/testing';
import { HcpService } from './hcp.service';

describe('HcpService', () => {
	let service: HcpService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [HcpService],
		}).compile();

		service = module.get<HcpService>(HcpService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
