import { Types } from 'mongoose';

/**
 * Filter value matching an id stored either as an ObjectId or as its hex
 * string. Many reference fields (e.g. `patient`) are declared with the
 * mongodb driver's ObjectId, which Mongoose treats as Mixed: it neither casts
 * query values nor normalises what is written, so both forms exist in the
 * data and a plain string filter misses the ObjectId ones (and vice versa).
 */
export function anyIdForm(id: string | Types.ObjectId) {
	const hex = id.toString();
	return /^[0-9a-f]{24}$/i.test(hex)
		? { $in: [hex, new Types.ObjectId(hex)] }
		: hex;
}
