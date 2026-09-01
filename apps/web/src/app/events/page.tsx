'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/auth/BrandLogo';
import { EventCalendar } from '@/components/EventCalendar';
import { SessionCard } from '@/components/SessionCard';
import type { CalendarEvent, EventSession } from '@/components/SessionCard';
import { Navigation } from '@/components/layout/Navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { currentKLYearMonth, isDateKeyInSessionRange } from '@/lib/eventTime';

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export default function EventsPage() {
  const { user: authUser } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [yearMonth, setYearMonth] = useState(currentKLYearMonth);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'event' | 'webinar'>('event');

  useEffect(() => {
    const params = new URLSearchParams({
      month: `${yearMonth.year}-${String(yearMonth.month).padStart(2, '0')}`,
    });
    // Category/speaker are filtered client-side below (see eventCards) — Webinar cards must
    // stay unaffected by them, which a server-side filter on the whole /events response
    // couldn't express, so the full month is always fetched unfiltered.
    // GET /events is fully public (works with no token at all), but sending one when present
    // lets a SUPER_ADMIN caller also see Draft events here — everyone else gets the same
    // PUBLISHED-only response whether or not a token is sent.
    const token = localStorage.getItem('token');
    fetch(`${apiUrl}/events?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [yearMonth]);

  // Options for the Category filter — derived from the Events already loaded for this month
  // (same trick as the Speaker filter below) rather than a separate authenticated lookup, since
  // GET /event-categories is SUPER_ADMIN-only. Only events with a non-Webinar session count —
  // a Webinar-only event never appears in eventCards, so its categories would be dead-end filter
  // options otherwise.
  const categoryOptions = useMemo(() => {
    const categories = new Map<string, string>();
    for (const event of events) {
      if (!event.sessions.some((s) => s.sessionType !== 'WEBINAR')) continue;
      for (const c of event.categories) categories.set(c.id, c.name);
    }
    return Array.from(categories, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [events]);

  // Options for the Speaker filter — only speakers who actually appear on an Event (non-Webinar)
  // session, matching that filter's scope (same as Category, see eventCards below).
  const speakerOptions = useMemo(() => {
    const speakers = new Map<string, string>();
    for (const event of events) {
      for (const session of event.sessions) {
        if (session.sessionType === 'WEBINAR') continue;
        for (const s of session.speakers) speakers.set(s.id, s.name);
      }
    }
    return Array.from(speakers, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [events]);

  // Online/Offline sessions — the main card grid, filtered by title search/category/speaker/
  // selected date.
  const eventCards = useMemo(() => {
    const query = search.trim().toLowerCase();
    const cards: { event: CalendarEvent; session: EventSession }[] = [];
    for (const event of events) {
      if (query && !event.title.toLowerCase().includes(query)) continue;
      if (category && !event.categories.some((c) => c.id === category)) continue;
      for (const session of event.sessions) {
        if (session.sessionType === 'WEBINAR') continue;
        if (speaker && !session.speakers.some((s) => s.id === speaker)) continue;
        // ONLINE/OFFLINE always have dates (only WEBINAR, excluded above, can be dateless).
        if (
          selectedDate &&
          !isDateKeyInSessionRange(selectedDate, session.startDateTime!, session.endDateTime!)
        )
          continue;
        cards.push({ event, session });
      }
    }
    return cards;
  }, [events, selectedDate, search, category, speaker]);

  // Webinar sessions — its own section, only ever filtered by the selected calendar date, not
  // category/speaker (a free online talk has no region/speaker filter applied to it).
  const webinarCards = useMemo(() => {
    const cards: { event: CalendarEvent; session: EventSession }[] = [];
    for (const event of events) {
      for (const session of event.sessions) {
        if (session.sessionType !== 'WEBINAR') continue;
        // WEBINAR has no date — nothing to filter against, so it always passes regardless of
        // which calendar day is selected (in practice this is always the case; the null checks
        // just cover an admin optionally still setting one).
        if (
          selectedDate &&
          session.startDateTime &&
          session.endDateTime &&
          !isDateKeyInSessionRange(selectedDate, session.startDateTime, session.endDateTime)
        )
          continue;
        cards.push({ event, session });
      }
    }
    return cards;
  }, [events, selectedDate]);

  const goToNextMonth = () => {
    setSelectedDate(null);
    setYearMonth((prev) =>
      prev.month === 12 ? { year: prev.year + 1, month: 1 } : { year: prev.year, month: prev.month + 1 },
    );
  };

  const goToPrevMonth = () => {
    setSelectedDate(null);
    setYearMonth((prev) =>
      prev.month === 1 ? { year: prev.year - 1, month: 12 } : { year: prev.year, month: prev.month - 1 },
    );
  };

  // The left arrow stops at the current (today's) month — the API never returns past sessions,
  // so paging earlier would only ever show an empty month.
  const todayYearMonth = currentKLYearMonth();
  const canGoPrev =
    yearMonth.year > todayYearMonth.year ||
    (yearMonth.year === todayYearMonth.year && yearMonth.month > todayYearMonth.month);

  const navUserName = authUser?.fullName ?? '';
  const navUser = { name: navUserName, initials: initials(navUserName), role: authUser?.role ?? '' };

  const calendar = (
    <EventCalendar
      year={yearMonth.year}
      month={yearMonth.month}
      events={events}
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      onPrevMonth={goToPrevMonth}
      onNextMonth={goToNextMonth}
      canGoPrev={canGoPrev}
    />
  );

  // Title search/category/speaker only ever filter this section — Webinars are exempt (see
  // webinarCards).
  const eventSection = (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="lg:flex-1">
          <SearchInput id="titleSearch" value={search} onValueChange={setSearch} placeholder="Search by title..." />
        </div>
        <div className="flex gap-3">
          <div className="flex-1 sm:flex-none sm:w-48">
            <SearchableSelect
              id="categoryFilter"
              onChange={setCategory}
              options={categoryOptions}
              placeholder="All categories"
              value={category}
            />
          </div>
          <div className="flex-1 sm:flex-none sm:w-48">
            <SearchableSelect
              id="speakerFilter"
              onChange={setSpeaker}
              options={speakerOptions}
              placeholder="All speakers"
              value={speaker}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {eventCards.map(({ event, session }) => (
          <SessionCard key={session.id} event={event} session={session} />
        ))}
      </div>
      {eventCards.length === 0 && (
        <p className="text-center text-slate-400 py-12">No upcoming events this month.</p>
      )}
    </div>
  );

  const webinarSection = (
    <div className="space-y-4">
      {webinarCards.map(({ event, session }) => (
        <SessionCard key={session.id} event={event} session={session} />
      ))}
      {webinarCards.length === 0 && (
        <p className="text-center text-slate-400 py-6 text-sm">No webinars this month.</p>
      )}
    </div>
  );

  const body = (
    <div>
      {/* Desktop: Calendar + Webinars stacked in the left column, Event grid on the right —
          both sections always visible side by side, no tabs. */}
      <div className="hidden lg:grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {calendar}
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Webinars</h2>
            {webinarSection}
          </div>
        </div>
        <div className="lg:col-span-3">{eventSection}</div>
      </div>

      {/* Mobile/tablet: Calendar shared above, Event/Webinar split into tabs below it. */}
      <div className="lg:hidden space-y-4">
        {calendar}
        <div className="flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('event')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'event' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'
            }`}
          >
            Event
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('webinar')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'webinar' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'
            }`}
          >
            Webinar
          </button>
        </div>
        {activeTab === 'event' ? eventSection : webinarSection}
      </div>
    </div>
  );

  // Not logged in: the sidebar Navigation shell depends on an authenticated user, so a
  // lightweight header (matching the homepage's) is used instead — Events is public, this
  // page must render sensibly with no session at all.
  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-50">
        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <BrandLogo />
            <div className="flex items-center gap-4">
              <Link href="/login" className="font-medium text-gray-600 transition-colors hover:text-gray-900">
                Sign In
              </Link>
              <Button variant="gradient" size="md" href="/signup">
                Get Started
              </Button>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">Events</h1>
          {body}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Navigation user={navUser} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <PageHeader defaultTitle="Events" onOpenMobileMenu={() => setMobileMenuOpen(true)}>
          {body}
        </PageHeader>
      </div>
    </div>
  );
}
