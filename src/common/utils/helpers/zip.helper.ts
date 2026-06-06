export function zip<T, S>(arr1: T[], arr2: S[]): Array<[T, S]> {
	const length = Math.min(arr1.length, arr2.length);
	return Array.from({ length }, (_, i) => [arr1[i], arr2[i]]);
}
