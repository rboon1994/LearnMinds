// Every Event Session time is a real-world Malaysia date/time (physical venue or a Zoom call
// scheduled in Malaysia), so it must display and bucket consistently by that fixed timezone —
// not the viewer's browser-local timezone, which would shift the same UTC instant onto a
// different calendar day for overseas visitors. Kuala Lumpur is a fixed UTC+8 offset with no
// DST, so a timezone library isn't needed — every function below just works in that one
// fixed offset.

const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

// Display label for a session's date/time, always in Malaysia time regardless of the
// viewer's browser timezone.
export function formatSessionTime(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  // en-GB keeps the day-month-year ordering used elsewhere in this file, but its am/pm is
  // lowercase — uppercase it directly rather than switching locale (en-US reorders to
  // month-day-year, which would be inconsistent with formatSessionDate/formatDateRange).
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kuala_Lumpur',
  })
    .format(date)
    .replace(' am', ' AM')
    .replace(' pm', ' PM');
}

// Date-only variant of formatSessionTime (no hour/minute) — for list views that show a
// session's day without needing the time, e.g. the admin Events table's Start/End Date columns.
export function formatSessionDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(date);
}

// Time-only variant of formatSessionTime (no date) — for a "Start Time – End Time" line shown
// underneath a separately-displayed date range.
export function formatSessionTimeOnly(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kuala_Lumpur',
  })
    .format(date)
    .replace(' am', ' AM')
    .replace(' pm', ' PM');
}

// "Day + month, no year" — only used inside formatSessionDateRange for a start date that
// shares its end date's year but not its month (e.g. the "28 Jul" in "28 Jul - 3 Aug 2026").
function formatKLDayMonth(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(date);
}

// Fixed-timezone equivalent of duration.ts's old formatDateRange (same collapsing rules —
// "15-17 Aug 2026", "28 Jul - 3 Aug 2026", "15 Aug 2026", null when there's no start at all —
// but resolved in Malaysia time instead of the viewer's browser-local timezone). Shared by both
// the Events pages and the Learn/Courses pages, which all display Malaysia-anchored dates.
export function formatSessionDateRange(
  startValue: string | Date | null,
  endValue: string | Date | null,
): string | null {
  if (!startValue) return null;
  const start = typeof startValue === 'string' ? new Date(startValue) : startValue;
  const end = endValue ? (typeof endValue === 'string' ? new Date(endValue) : endValue) : start;

  const startKey = sessionDateKey(start);
  const endKey = sessionDateKey(end);
  if (startKey === endKey) return formatSessionDate(start);

  const sameYear = startKey.slice(0, 4) === endKey.slice(0, 4);
  const sameMonth = sameYear && startKey.slice(0, 7) === endKey.slice(0, 7);
  const startLabel = sameMonth
    ? String(Number(startKey.slice(8, 10)))
    : sameYear
      ? formatKLDayMonth(start)
      : formatSessionDate(start);
  return `${startLabel} - ${formatSessionDate(end)}`;
}

// "Which calendar day (in Malaysia) does this session fall on" — for the month-grid's
// day-bucketing. Deliberately not `date.getDate()`/`getMonth()`, which read the browser's
// local timezone.
export function sessionDateKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(date); // en-CA gives YYYY-MM-DD directly
}

// Whether a "YYYY-MM-DD" (Malaysia) day key falls within a session's start–end span, inclusive
// of both ends — a session running 21–23 Aug touches all three days, not just where it starts.
// sessionDateKey's en-CA format is zero-padded YYYY-MM-DD, so plain string comparison sorts
// correctly without needing to parse either side back into a Date.
export function isDateKeyInSessionRange(
  dateKey: string,
  startValue: string | Date,
  endValue: string | Date,
): boolean {
  const startKey = sessionDateKey(startValue);
  const endKey = sessionDateKey(endValue);
  return dateKey >= startKey && dateKey <= endKey;
}

// Every Malaysia calendar day a session spans, from its start day through its end day
// inclusive — used to mark all of a multi-day session's days on the calendar grid, not just
// the first one.
export function sessionDateKeysInRange(startValue: string | Date, endValue: string | Date): string[] {
  const startKey = sessionDateKey(startValue);
  const endKey = sessionDateKey(endValue);
  const keys: string[] = [];
  let cursor = new Date(`${startKey}T00:00:00+08:00`);
  const endCursor = new Date(`${endKey}T00:00:00+08:00`);
  while (cursor.getTime() <= endCursor.getTime()) {
    keys.push(sessionDateKey(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return keys;
}

// `<input type="datetime-local">` value (a bare "YYYY-MM-DDTHH:mm", no timezone) → the
// corresponding real instant, treating that bare string as Malaysia wall-clock time
// regardless of what timezone the admin's browser happens to be in.
export function fromKLInputValue(rawValue: string): Date {
  return new Date(`${rawValue}:00+08:00`);
}

// The mirror of fromKLInputValue: a stored instant → the bare string to prefill a
// `datetime-local` input with, so it reads back as the same Malaysia wall-clock time that
// was originally entered. Shifting the instant by the fixed +8h offset and then reading it
// with the UTC getters is a shortcut that works only because Kuala Lumpur has no DST.
export function toKLInputValue(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Date(date.getTime() + KL_OFFSET_MS).toISOString().slice(0, 16);
}

// "Now" bucketed into a Malaysia year/month, so the default view matches what the backend's
// own KL-anchored `?month=` default resolves to.
export function currentKLYearMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'Asia/Kuala_Lumpur',
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value),
  };
}
