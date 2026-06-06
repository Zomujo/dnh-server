import { Test, TestingModule } from '@nestjs/testing';
import { ChronicleerService } from './chronicleer.service';

describe('ChronicleerService', () => {
	let service: ChronicleerService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [ChronicleerService],
		}).compile();

		service = module.get<ChronicleerService>(ChronicleerService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
