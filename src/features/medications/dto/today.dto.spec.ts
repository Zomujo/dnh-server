import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmMedicationQueryDto } from './today.dto';

const errors = async (scheduledFor: string) =>
	(
		await validate(
			plainToInstance(ConfirmMedicationQueryDto, {
				section: 'MORNING',
				scheduledFor,
			}),
		)
	).map((e) => e.property);

describe('ConfirmMedicationQueryDto.scheduledFor', () => {
	it.each([
		'2026-10-22',
		'2026-10-22T08:00:00Z',
		'2026-10-22T08:00:00.000+00:00',
	])('accepts %s', async (value) => {
		expect(await errors(value)).toEqual([]);
	});

	// Valid ISO 8601 forms that new Date() can't parse.
	it.each([
		'20261022',
		'2026-W43',
		'2026-296',
		'2026-02-30',
	])('rejects %s', async (value) => {
		expect(await errors(value)).toEqual(['scheduledFor']);
	});
});
