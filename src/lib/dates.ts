import { format, parseISO, subDays } from 'date-fns';

/**
 * Order and expense dates are plain days ("2026-10-26"). `new Date()` reads
 * those as UTC midnight, which is 6 AM in Dhaka, so a record dated today
 * looked like it was in the future until morning. These helpers keep them
 * as local days.
 */

/** A plain day ("YYYY-MM-DD") as local midnight, for formatting. */
export function parseDay(day: string): Date {
  return parseISO(day);
}

/** Today as a plain day, in the browser's time zone. */
export function todayKey(now = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

export type DayFilter = 'today' | '7days' | '30days' | 'custom';

/**
 * Whether a plain day falls in the list filter's range. Plain days sort as
 * strings, so no time zone conversion is involved. 'custom' means all time.
 */
export function inDayFilter(day: string, filter: DayFilter, now = new Date()): boolean {
  const today = todayKey(now);
  switch (filter) {
    case 'today': return day === today;
    case '7days': return day >= todayKey(subDays(now, 7)) && day <= today;
    case '30days': return day >= todayKey(subDays(now, 30)) && day <= today;
    default: return true;
  }
}
