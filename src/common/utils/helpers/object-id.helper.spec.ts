import { Types } from 'mongoose';
import { anyIdForm } from './object-id.helper';

describe('anyIdForm', () => {
	it('matches both the string and the ObjectId form', () => {
		const id = new Types.ObjectId();
		for (const input of [id, id.toString()]) {
			expect(anyIdForm(input)).toEqual({ $in: [id.toString(), id] });
		}
	});

	it('leaves a value that is not an ObjectId as is', () => {
		expect(anyIdForm('patient-123')).toBe('patient-123');
	});
});
