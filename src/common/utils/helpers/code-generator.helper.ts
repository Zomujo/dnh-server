export function generateCode(_prefix?: string, _name?: string) {
	const uuid = crypto.randomUUID();
	const slicedString = uuid.slice(0, 8);
	return slicedString.toUpperCase();
}

export function generateAnotherCode(prefix: string, name: string) {
	const splitName = name.split(/\W+/).filter((segment) => segment.length > 0);

	const initialsArr = splitName.map((segment) => segment[0].toUpperCase());
	const initials = initialsArr.join('');
	const randomCode = Math.floor(Math.random() * 100000)
		.toString()
		.padStart(5, '0');

	const uniqueId = `${prefix}-${initials}${randomCode}`;

	return uniqueId;
}
