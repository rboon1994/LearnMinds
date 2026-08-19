'use client';

import { sessionDateKeysInRange } from '@/lib/eventTime';
import { Icon } from './ui/Icon';
import { eventColorIndex, type CalendarEvent } from './SessionCard';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Same colors/order as SessionCard's gradients (via the shared eventColorIndex), just solid
// dot classes instead of gradient classes.
const DOT_COLOR_CLASSES = [
  'bg-cyan-500',
  'bg-amber-500',
  'bg-pink-500',
  'bg-green-500',
  'bg-red-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-orange-500',
];

export function EventCalendar({
  year,
  month,
  events,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  canGoPrev,
  hideNav,
}: {
  year: number;
  month: number; // 1-12
  events: CalendarEvent[];
  selectedDate: string | null;
  onSelectDate: (dateKey: string | null) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  // The API never returns past sessions, so paging earlier than the current month would only
  // ever be empty — the left arrow stops there instead of paging into a guaranteed-blank month.
  canGoPrev: boolean;
  hideNav?: boolean;
}) {
  // Per day, the distinct Events that have a session that day — multiple sessions from the
  // same Event on the same day collapse to that Event's one dot, not one dot each.
  const eventIdsByDate = new Map<string, Set<string>>();
  for (const event of events) {
    for (const session of event.sessions) {
      // WEBINAR sessions have no date at all — nothing to place on the grid, skip them.
      if (!session.startDateTime || !session.endDateTime) continue;
      // A multi-day session (e.g. 21–23 Aug) marks every day it spans, not just the first.
      for (const dateKey of sessionDateKeysInRange(session.startDateTime, session.endDateTime)) {
        if (!eventIdsByDate.has(dateKey)) eventIdsByDate.set(dateKey, new Set());
        eventIdsByDate.get(dateKey)!.add(event.id);
      }
    }
  }

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: { day: number; dateKey: string }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      dateKey: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    });
  }

  const monthLabel = firstOfMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        {!hideNav && (
          <button
            aria-label="Previous month"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-400"
            disabled={!canGoPrev}
            onClick={onPrevMonth}
            type="button"
          >
            <Icon className="h-4 w-4" name="arrow-left" />
          </button>
        )}
        <h3 className="text-sm font-semibold text-slate-900">{monthLabel}</h3>
        {!hideNav && (
          <button
            aria-label="Next month"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700"
            onClick={onNextMonth}
            type="button"
          >
            <Icon className="h-4 w-4 rotate-180" name="arrow-left" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1 text-center text-xs text-slate-400">
        {WEEKDAY_LABELS.map((label, idx) => (
          <div key={idx}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startWeekday }).map((_, idx) => (
          <div key={`pad-${idx}`} />
        ))}
        {cells.map(({ day, dateKey }) => {
          const eventIds = eventIdsByDate.get(dateKey);
          const hasSessions = !!eventIds;
          const isSelected = dateKey === selectedDate;
          return (
            <button
              key={dateKey}
              type="button"
              disabled={!hasSessions}
              onClick={() => onSelectDate(isSelected ? null : dateKey)}
              className={`aspect-square rounded-lg text-sm flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isSelected
                  ? 'bg-indigo-600 text-white'
                  : hasSessions
                    ? 'text-slate-900 hover:bg-indigo-50'
                    : 'text-slate-300 cursor-default'
              }`}
            >
              {day}
              {eventIds && (
                <span className="flex flex-wrap items-center justify-center gap-0.5">
                  {[...eventIds].map((eventId) => (
                    <span
                      key={eventId}
                      className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : DOT_COLOR_CLASSES[eventColorIndex(eventId)]}`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
