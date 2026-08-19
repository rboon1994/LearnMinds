'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      month: `${year}-${String(month).padStart(2, '0')}`,
    });
    fetch(`${apiUrl}/events?${params.toString()}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .catch(() => {});
    return () => controller.abort();
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Calendar — left 2/3 on md+, hidden on mobile */}
        {/* ponytail: role="link" div avoids <a>+<button> nesting (HTML spec violation) */}
        <div
          role="link"
          tabIndex={0}
          onClick={() => router.push('/events')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') router.push('/events'); }}
          aria-label="Browse upcoming events by date"
          className="hidden md:block col-span-1 md:col-span-2 group relative rounded-2xl ring-1 ring-transparent hover:ring-2 hover:ring-indigo-300 transition-all cursor-pointer"
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
        </div>

        {/* Event cards — right 1/3 on md+, full width on mobile */}
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
