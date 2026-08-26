'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { EventLandingTemplate } from '@/components/EventLandingTemplate';
import type { LandingContent } from '@/lib/eventLandingContent';
import { apiUrl } from '@/lib/api';

type EventData = { title: string; landingContent: LandingContent };

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; event: EventData };

// Split out from the page's default export because useSearchParams() requires its caller to be
// wrapped in a <Suspense> boundary in the App Router — omitting it either fails the build or
// forces this route to de-opt to fully client-side rendering, depending on Next.js version.
function EventLandingPageContent() {
  const { id } = useParams<{ id: string }>();
  const titleHint = useSearchParams().get('title');
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  // Query-param hint only ever drives this transient loading placeholder — never treated as
  // trustworthy data — so it sets the tab title immediately, before the real fetch resolves.
  useEffect(() => {
    if (titleHint) document.title = titleHint;
  }, [titleHint]);

  useEffect(() => {
    // Same "attach token if present" trick as /events — lets a SUPER_ADMIN preview a DRAFT
    // event's landing page; everyone else gets the same PUBLISHED-only response either way.
    const token = localStorage.getItem('token');
    fetch(`${apiUrl}/events/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((event: EventData) => {
        document.title = event.title;
        setState({ status: 'ready', event });
      })
      .catch(() => setState({ status: 'error' }));
  }, [id]);

  if (state.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Event not found</div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        {titleHint ?? 'Loading...'}
      </div>
    );
  }

  return <EventLandingTemplate content={state.event.landingContent} />;
}

// No Navigation/PageHeader shell — this is a standalone public page for an anonymous visitor.
export default function EventLandingPage() {
  return (
    <Suspense fallback={null}>
      <EventLandingPageContent />
    </Suspense>
  );
}
