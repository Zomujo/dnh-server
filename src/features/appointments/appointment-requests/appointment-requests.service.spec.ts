import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentRequestsService } from './appointment-requests.service';

describe('AppointmentRequestsService', () => {
	let service: AppointmentRequestsService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [AppointmentRequestsService],
		}).compile();

		service = module.get<AppointmentRequestsService>(
			AppointmentRequestsService,
		);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
