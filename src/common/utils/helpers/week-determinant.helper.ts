export function getStartOfWeek(date: string = new Date().toDateString()) {
	const start = new Date(date);
	const day = start.getDay();
	const diff = start.getDate() - day;
	return new Date(start.setDate(diff));
}

export function isNewWeek(streakStartDate: Date) {
	const currentStartOfWeek = getStartOfWeek();
	const streakStartOfWeek = getStartOfWeek(
		new Date(streakStartDate).toDateString(),
	);
	// If more than a week has passed, it's a new week
	return currentStartOfWeek > streakStartOfWeek;
}
