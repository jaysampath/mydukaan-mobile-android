/**
 * Date and time formatting.
 *
 * Note the wire format changed with the read layer: timestamps used to cross as
 * epoch milliseconds (what WatermelonDB's @date fields wanted) and now arrive as
 * ISO 8601 strings from to_jsonb(). A build that still did `new Date(number)`
 * would silently render 1970, so parsing is centralised here and tested.
 *
 * `*_at` columns are timestamps (ISO datetime). `*_on` columns are calendar
 * dates (ISO date, no time) -- a payment is "on" a day, not "at" an instant.
 */

/** Parses either wire format. Returns null rather than an Invalid Date. */
export function parseWhen(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14 Sep" or "14 Sep 2025" once the year differs from now. */
export function formatDate(
  value: string | number | null | undefined,
  now: Date = new Date(),
): string {
  const d = parseWhen(value);
  if (!d) return '-';
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

/** "3:05 pm" -- 12-hour, because that is how the time of day is spoken here. */
export function formatTime(value: string | number | null | undefined): string {
  const d = parseWhen(value);
  if (!d) return '-';
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m} ${h24 < 12 ? 'am' : 'pm'}`;
}

/**
 * What a list row shows: the time if it happened today, "Yesterday" if it did
 * not, otherwise the date. On a busy day an owner is scanning for "when", and
 * every row saying the same date tells them nothing.
 */
export function formatWhen(
  value: string | number | null | undefined,
  now: Date = new Date(),
): string {
  const d = parseWhen(value);
  if (!d) return '-';
  if (sameDay(d, now)) return formatTime(d.toISOString());
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return formatDate(d.toISOString(), now);
}

/** Today as an ISO calendar date, for the `*_on` parameters. */
export function todayIso(now: Date = new Date()): string {
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${now.getFullYear()}-${m}-${day}`;
}
