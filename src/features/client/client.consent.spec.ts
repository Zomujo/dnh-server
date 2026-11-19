import { NotFoundException } from '@nestjs/common';
import { TestBed } from '@suites/unit';
import { ClientService } from './client.service';

// GET/PUT /client/consent: the patient grants or withdraws consent.
describe('ClientService consent', () => {
	let service: ClientService;
	let patientsService: Record<string, any>;

	beforeEach(async () => {
		const { unit } = await TestBed.solitary(ClientService).compile();
		service = unit;
		patientsService = (service as any).patientsService;
		patientsService.recordConsent = vi.fn().mockResolvedValue(true);
		patientsService.findConsentByUserId = vi
			.fn()
			.mockResolvedValue({ consent: null, history: [] });
	});

	it('records a grant from the app', async () => {
		await service.updateConsent('uid-1', {
			granted: true,
			policyVersion: '2026-11',
		});

		expect(patientsService.recordConsent).toHaveBeenCalledWith(
			{ userId: 'uid-1' },
			expect.objectContaining({
				status: 'granted',
				policyVersion: '2026-11',
				channel: 'app',
			}),
		);
		expect(patientsService.findConsentByUserId).toHaveBeenCalledWith('uid-1');
	});

	it('records a withdrawal without deleting anything', async () => {
		await service.updateConsent('uid-1', {
			granted: false,
			policyVersion: '2026-11',
		});

		expect(patientsService.recordConsent).toHaveBeenCalledWith(
			{ userId: 'uid-1' },
			expect.objectContaining({ status: 'withdrawn' }),
		);
		expect(patientsService.removePatientsByUserId).not.toHaveBeenCalled();
	});

	it('is a 404 when the account has no patient record', async () => {
		patientsService.recordConsent = vi.fn().mockResolvedValue(false);

		await expect(
			service.updateConsent('uid-1', { granted: true, policyVersion: 'v1' }),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('reads the consent state', async () => {
		await expect(service.fetchConsent('uid-1')).resolves.toEqual({
			consent: null,
			history: [],
		});
	});
});
