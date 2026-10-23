import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddSymptomsDto } from './create.dto';

const errors = async (plain: object) =>
	(await validate(plainToInstance(AddSymptomsDto, plain))).flatMap((e) =>
		Object.keys(e.constraints ?? {}),
	);

describe('AddSymptomsDto', () => {
	it('accepts a description alone', async () => {
		expect(await errors({ description: 'Headache' })).toEqual([]);
	});

	it('caps the description at 1000 characters', async () => {
		expect(await errors({ description: 'a'.repeat(1000) })).toEqual([]);
		expect(await errors({ description: 'a'.repeat(1001) })).toContain(
			'maxLength',
		);
	});

	it('accepts a past onsetDate and parses it', async () => {
		const dto = plainToInstance(AddSymptomsDto, {
			description: 'Dizzy',
			onsetDate: '2026-10-20T08:30:00Z',
		});
		expect(await validate(dto)).toEqual([]);
		expect(dto.onsetDate).toEqual(new Date('2026-10-20T08:30:00Z'));
	});

	it('rejects a future onsetDate and garbage', async () => {
		const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
		expect(
			await errors({ description: 'Dizzy', onsetDate: tomorrow }),
		).toContain('maxDate');
		expect(
			await errors({ description: 'Dizzy', onsetDate: 'yesterday' }),
		).toContain('isDate');
	});
});
