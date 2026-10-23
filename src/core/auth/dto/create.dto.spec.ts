import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { subDays, subYears } from 'date-fns';
import { OnboardDto } from './create.dto';

const base = {
	firstname: 'Ama',
	lastname: 'Mensah',
	gender: 'female',
	chronicConditions: ['hypertension'],
};

async function errorsFor(extra: Record<string, unknown>) {
	const dto = plainToInstance(OnboardDto, { ...base, ...extra });
	const errors = await validate(dto);
	return errors.flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe('OnboardDto age rule', () => {
	it('accepts an adult date of birth', async () => {
		expect(
			await errorsFor({ dateOfBirth: subYears(new Date(), 30).toISOString() }),
		).toEqual([]);
	});

	it('accepts someone turning 18 today', async () => {
		expect(
			await errorsFor({ dateOfBirth: subYears(new Date(), 18).toISOString() }),
		).toEqual([]);
	});

	it('rejects someone a day short of 18', async () => {
		const dob = subDays(subYears(new Date(), 18), -1);
		expect(await errorsFor({ dateOfBirth: dob.toISOString() })).toContain(
			'minimumAge',
		);
	});

	it('rejects a date of birth in the future', async () => {
		expect(
			await errorsFor({ dateOfBirth: subDays(new Date(), -1).toISOString() }),
		).toContain('maxDate');
	});

	it('rejects an age under 18 and accepts 18', async () => {
		expect(await errorsFor({ age: 17 })).toContain('min');
		expect(await errorsFor({ age: 18 })).toEqual([]);
	});
});
