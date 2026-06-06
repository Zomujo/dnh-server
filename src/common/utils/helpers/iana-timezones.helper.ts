/**
 * Retrieves a list of all valid IANA timezone names.
 * @returns An array of strings, e.g., ['America/New_York', 'Europe/London', ...].
 */
export function getAllIANATimezones(): string[] {
	// Check for browser/runtime support for the Intl API
	if (
		typeof Intl === 'undefined' ||
		typeof Intl.supportedValuesOf !== 'function'
	) {
		// Fallback or error handling for older environments
		console.error(
			'Intl.supportedValuesOf is not supported in this environment.',
		);
		return [];
	}

	// Get the list of all supported timezones
	return Intl.supportedValuesOf('timeZone');
}
