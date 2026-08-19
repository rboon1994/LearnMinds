'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EventCalendar } from './EventCalendar';
import type { CalendarEvent } from './SessionCard';
import { apiUrl } from '@/lib/api';

function currentKLYearMonth() {
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

export function HomepageEventsBlock() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const { year, month } = currentKLYearMonth();

  useEffect(() => {
    const params = new URLSearchParams({
      month: `${year}-${String(month).padStart(2, '0')}`,
    });
    fetch(`${apiUrl}/events?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .catch(() => {});
  }, [year, month]);

  if (events.length === 0) return null;

  const preview = events.slice(0, 3);

  return (
    <div className="w-full mt-8 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Upcoming Events</h2>
        <Link
          href="/events"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          View all events →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Calendar — left 2/3, entire block links to /events */}
        <div className="col-span-2">
          <Link
            href="/events"
            className="group block relative rounded-2xl ring-1 ring-transparent hover:ring-2 hover:ring-indigo-300 transition-all"
          >
            <EventCalendar
              year={year}
              month={month}
              events={events}
              selectedDate={null}
              onSelectDate={() => {}}
              onPrevMonth={() => {}}
              onNextMonth={() => {}}
              canGoPrev={false}
              hideNav
            />
            <span className="absolute bottom-3 right-4 text-xs text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none">
              Browse by date →
            </span>
          </Link>
        </div>

        {/* Event cards — right 1/3, vertical stack */}
        <div className="col-span-1 flex flex-col gap-3">
          {preview.map((event) => (
            <Link
              key={event.id}
              href="/events"
              className="block flex-1 p-4 bg-white rounded-xl border border-gray-100 hover:shadow-md hover:border-indigo-200 transition-all"
            >
              <p className="text-sm font-semibold text-gray-900 line-clamp-1">{event.title}</p>
              {event.description && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{event.description}</p>
              )}
            </Link>
          ))}

          {/* "View all" placeholder card */}
          <Link
            href="/events"
            className="block p-4 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-300 transition-all text-center"
          >
            <p className="text-sm font-medium text-indigo-600">View all events →</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
