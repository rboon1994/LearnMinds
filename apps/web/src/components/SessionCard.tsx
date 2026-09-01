'use client';

import { motion } from 'framer-motion';
import type { LandingContent } from '@/lib/eventLandingContent';
import { formatSessionDateRange, formatSessionTimeOnly } from '@/lib/eventTime';
import { Icon } from './ui/Icon';

export type SessionType = 'WEBINAR' | 'ONLINE' | 'OFFLINE';
export type SessionStatus =
  | 'OPEN'
  | 'PLANNING'
  | 'SCHEDULED'
  | 'SELLING_FAST'
  | 'LAST_FEW_SEATS'
  | 'FULL'
  | 'CLOSED';

export type Speaker = { id: string; name: string; thumbnail: string | null };

export type EventSession = {
  id: string;
  sessionType: SessionType;
  // Only ever null for WEBINAR — it has no date at all (no calendar placement, never expires
  // automatically). Always set for ONLINE/OFFLINE.
  startDateTime: string | null;
  endDateTime: string | null;
  venue: string | null;
  venueMapLink: string | null;
  country: string | null;
  // Only ever set for WEBINAR — its own registration/landing page. ONLINE/OFFLINE cards use the
  // parent Event's landingPageLink instead (see CalendarEvent).
  landingPageLink: string | null;
  price: number;
  memberPrice: number | null;
  status: SessionStatus;
  speakers: Speaker[];
};

export type EventCategoryTag = { id: string; name: string };

export type CalendarEvent = {
  id: string;
  title: string;
  // Admin-managed tags (see apps/api/src/event-categories) — full {id,name} objects (not just
  // ids) so the public page's filter can derive its own options straight from loaded Events,
  // same as it does for Speaker, without a separate authenticated lookup.
  categories: EventCategoryTag[];
  description: string | null;
  thumbnail: string | null;
  // Optional because most callers of GET /events never receive a DRAFT event at all (only a
  // SUPER_ADMIN caller does) — absent for everyone else, so this field simply won't be there.
  status?: 'DRAFT' | 'PUBLISHED';
  // Templated, admin-editable landing page content for every ONLINE/OFFLINE session card
  // (shared across all of this Event's sessions) — WEBINAR sessions use their own
  // EventSession.landingPageLink instead.
  landingContent: LandingContent;
  sessions: EventSession[];
};

const TYPE_LABEL: Record<SessionType, string> = {
  WEBINAR: 'Webinar',
  ONLINE: 'Online',
  OFFLINE: 'Offline',
};

const TYPE_BADGE_CLASS: Record<SessionType, string> = {
  WEBINAR: 'bg-emerald-50 text-emerald-700',
  ONLINE: 'bg-blue-50 text-blue-700',
  OFFLINE: 'bg-purple-50 text-purple-700',
};

const MARKETING_LABEL: Record<SessionStatus, string> = {
  OPEN: 'Open',
  PLANNING: 'Planning',
  SCHEDULED: 'Scheduled',
  SELLING_FAST: 'Selling Fast',
  LAST_FEW_SEATS: 'Last Few Seats',
  FULL: 'Full',
  CLOSED: 'Closed',
};

// SELLING_FAST/LAST_FEW_SEATS get an urgency treatment to nudge registration — everything else
// stays the neutral badge. Same light-bg/dark-text pattern as TYPE_BADGE_CLASS above (contrast
// is a non-issue at these tints, unlike a solid dark fill with white text). No border, no
// pulse/glow — those read as inconsistent with this flatter, lighter style.
const MARKETING_BADGE_CLASS: Record<SessionStatus, string> = {
  OPEN: 'bg-slate-900 text-white font-medium',
  PLANNING: 'bg-slate-900 text-white font-medium',
  SCHEDULED: 'bg-slate-900 text-white font-medium',
  SELLING_FAST: 'bg-orange-100 text-orange-700 font-semibold',
  LAST_FEW_SEATS: 'bg-red-100 text-red-700 font-semibold',
  FULL: 'bg-slate-900 text-white font-medium',
  CLOSED: 'bg-slate-900 text-white font-medium',
};

// WEBINAR has no price concept at all ('none' — the card renders nothing). ONLINE/OFFLINE
// render a single centered price when there's no member discount to call out, and split into
// a plain original price + a labelled "Member Price" only when a discount actually applies.
type PriceDisplay =
  | { kind: 'none' }
  | { kind: 'single'; label: string }
  | { kind: 'split'; original: string; memberLabel: string };

function priceDisplay(session: EventSession): PriceDisplay {
  const { sessionType, price, memberPrice } = session;
  if (sessionType === 'WEBINAR') return { kind: 'none' };
  if (price <= 0) return { kind: 'single', label: 'Free' };
  // ONLINE and OFFLINE both default to free for members when no memberPrice is set at all —
  // an explicit memberPrice is required to charge members anything.
  const effectiveMemberPrice = memberPrice ?? 0;
  if (effectiveMemberPrice === price) return { kind: 'single', label: `RM${price.toFixed(2)}` };
  return {
    kind: 'split',
    original: `RM${price.toFixed(2)}`,
    memberLabel: effectiveMemberPrice > 0 ? `RM${effectiveMemberPrice.toFixed(2)}` : 'Free',
  };
}

// Same index picks a matching gradient here and a matching dot color in EventCalendar, so a
// given Event reads as the same color in both places.
export const EVENT_COLOR_COUNT = 8;

// Hashes the whole id (not just its first character) so ids sharing a common prefix — cuids
// often do — still spread across the palette instead of collapsing onto one color.
export function eventColorIndex(eventId: string) {
  let hash = 0;
  for (let i = 0; i < eventId.length; i++) hash = (hash + eventId.charCodeAt(i)) % EVENT_COLOR_COUNT;
  return hash;
}

export function SessionCard({
  event,
  session,
}: {
  event: CalendarEvent;
  session: EventSession;
}) {
  const gradientIdx = eventColorIndex(event.id);
  const gradients = [
    'from-cyan-500 to-blue-600',
    'from-amber-500 to-orange-600',
    'from-pink-500 to-purple-600',
    'from-green-500 to-emerald-600',
    'from-red-500 to-rose-600',
    'from-blue-500 to-indigo-600',
    'from-violet-500 to-fuchsia-600',
    'from-orange-500 to-red-600',
  ];

  // WEBINAR has its own external registration page per session; ONLINE/OFFLINE open this app's
  // own templated landing route instead (title passed as a query param purely to set the new
  // tab's title/skeleton before its own fetch resolves — never treated as trustworthy data).
  const landingUrl =
    session.sessionType === 'WEBINAR'
      ? session.landingPageLink
      : `/events/${event.id}/landing?title=${encodeURIComponent(event.title)}`;
  const goToLandingPage = () => {
    if (landingUrl) window.open(landingUrl, '_blank', 'noopener,noreferrer');
  };

  const price = priceDisplay(session);

  return (
    <motion.article
      whileHover={{ y: -4 }}
      className="group bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/50 transition-[box-shadow,border-color] cursor-pointer flex flex-col h-full"
      onClick={goToLandingPage}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goToLandingPage();
        }
      }}
      role="link"
      tabIndex={0}
    >
      {session.sessionType !== 'WEBINAR' && (
        <div className="relative aspect-video overflow-hidden">
          {event.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.thumbnail} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-linear-to-br ${gradients[gradientIdx]}`} />
          )}
        </div>
      )}

      <div className="p-4 gap-3 flex flex-col flex-1">
        <div className="flex flex-wrap gap-1.5">
          {session.sessionType !== 'WEBINAR' && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TYPE_BADGE_CLASS[session.sessionType]}`}
            >
              {TYPE_LABEL[session.sessionType]}
            </span>
          )}
          {session.status !== 'OPEN' && (
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${MARKETING_BADGE_CLASS[session.status]}`}
            >
              {session.status === 'SELLING_FAST' && <Icon name="bolt" className="h-3 w-3 text-yellow-500" />}
              {session.status === 'LAST_FEW_SEATS' && <Icon name="warning" className="h-3 w-3" />}
              {MARKETING_LABEL[session.status]}
            </span>
          )}
          {/* Only a SUPER_ADMIN caller ever receives a DRAFT event here at all — flag it so it
              doesn't look identical to a live, publicly-visible one. */}
          {event.status === 'DRAFT' && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white whitespace-nowrap">
              Draft
            </span>
          )}
        </div>

        {/* Admin-managed tags (see apps/api/src/event-categories) — own row, separate from
            Type/Status/Draft above, since an Event can have several. Not shown for WEBINAR —
            the Category filter doesn't apply there either. */}
        {session.sessionType !== 'WEBINAR' && event.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {event.categories.map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 whitespace-nowrap"
              >
                {c.name}
              </span>
            ))}
          </div>
        )}

        {session.sessionType === 'WEBINAR' && (
          <p className="text-xs font-semibold text-emerald-600">免费线上分享会</p>
        )}

        <h3 className="text-lg font-semibold text-slate-900 line-clamp-2 leading-snug">{event.title}</h3>

        {session.startDateTime && session.endDateTime && (
          <div>
            <p className="text-sm text-slate-700">
              {formatSessionDateRange(session.startDateTime, session.endDateTime)}
            </p>
            <p className="text-sm text-slate-500">
              {formatSessionTimeOnly(session.startDateTime)} – {formatSessionTimeOnly(session.endDateTime)}
            </p>
          </div>
        )}

        {event.description && (
          <p className={`text-sm text-slate-600 ${session.sessionType === 'WEBINAR' ? '' : 'line-clamp-2'}`}>
            {event.description}
          </p>
        )}

        {session.sessionType === 'OFFLINE' && session.venue && session.venueMapLink && (
          <a
            href={session.venueMapLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-sm text-slate-700 hover:text-indigo-600 hover:underline"
          >
            <Icon name="map-pin" className="h-4 w-4 shrink-0 text-slate-400" />
            {session.venue}
          </a>
        )}

        <div className="mt-auto">
          {price.kind === 'single' && <p className="text-sm font-semibold text-slate-900">{price.label}</p>}
          {price.kind === 'split' && (
            <div className="flex items-end justify-between">
              <p className="text-sm font-semibold text-slate-900">{price.original}</p>
              <div className="text-right">
                <p className="text-xs text-slate-400">Member</p>
                <p className="text-sm font-semibold text-indigo-600">{price.memberLabel}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}
