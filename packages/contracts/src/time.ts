/**
 * Sirius HR's business time zone: deadlines are calendar days there, and dates are shown in it.
 * Assumed Asia/Dubai (UAE) until Sirius confirms. Timestamps are stored in UTC.
 */
export const BUSINESS_TIME_ZONE = 'Asia/Dubai';

/** The calendar day (YYYY-MM-DD) of an instant in the business time zone. */
export function businessDay(instant: Date): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
