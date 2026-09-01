'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { EventCalendar } from './EventCalendar';
import type { CalendarEvent } from './SessionCard';
import { apiUrl } from '@/lib/api';
import { currentKLYearMonth } from '@/lib/eventTime';

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
    <div className="w-full mt-12">
      <div className="text-center max-w-3xl mx-auto mb-8">
        <h2 className="text-4xl font-bold mb-4">
          Upcoming{" "}
          <span className="gradient-text">Events</span>
        </h2>
        <p className="text-xl text-gray-600">
          Join live workshops and online sessions. Learn from experts and connect with your community.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Calendar — left 2/3 on md+, hidden on mobile */}
        {/* ponytail: role="link" div avoids <a>+<button> nesting (HTML spec violation) */}
        {/* ponytail: zoom:0.8 shrinks calendar layout footprint without component changes */}
        <div
          role="link"
          tabIndex={0}
          onClick={() => router.push('/events')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') router.push('/events'); }}
          aria-label="Browse upcoming events by date"
          className="hidden md:block col-span-1 md:col-span-2 zoom-[0.8] rounded-2xl ring-1 ring-transparent hover:ring-2 hover:ring-indigo-300 transition-all cursor-pointer"
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
        </div>

        {/* Event cards — right 1/3 on md+, full width on mobile */}
        <div className="col-span-1 flex flex-col gap-1.5">
          {preview.map((event) => (
            <Link
              key={event.id}
              href="/events"
              className="relative block overflow-hidden rounded-xl aspect-video hover:opacity-90 transition-opacity"
            >
              {event.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.thumbnail} alt={event.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full gradient-bg" />
              )}
            </Link>
          ))}

          {/* "View all" placeholder card */}
          <Link
            href="/events"
            className="block py-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-300 transition-all text-center"
          >
            <p className="text-sm font-medium text-indigo-600">View all events →</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
