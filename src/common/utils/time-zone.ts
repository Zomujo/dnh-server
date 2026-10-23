/**
 * Yelima is used in Ghana only, so every day boundary — medication "today",
 * adherence days, the 48 h confirm window, trend presets — is Accra time.
 *
 * The process runs in this zone (see src/set-time-zone.ts), so date-fns
 * helpers such as startOfDay are already Accra days. MongoDB date operators
 * ignore the process zone, so pass this as their `timezone` explicitly.
 */
export const APP_TIME_ZONE = 'Africa/Accra';
