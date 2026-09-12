import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ContentStatus,
  Prisma,
  Role,
  SessionStatus,
  SessionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import type { CreateSessionDto } from './dto/create-session.dto';
import type { UpdateSessionDto } from './dto/update-session.dto';
import type { EventsAdminQueryDto } from './dto/events-admin-query.dto';
import type { EventsQueryDto } from './dto/events-query.dto';
import type { LandingContent } from './dto/landing-content.dto';

const SPEAKER_SELECT = { select: { id: true, name: true, thumbnail: true } };

// Throttles closeExpiredSessions' write so anonymous read traffic can never turn it into a
// write-per-request — the public read methods' endDateTime filter keeps results correct
// regardless of how stale the persisted status is within this window.
const CLOSE_EXPIRED_SESSIONS_INTERVAL_MS = 60_000;

type SessionRow = { price: Prisma.Decimal; memberPrice: Prisma.Decimal | null };

// Prisma serializes Decimal as a string — convert to a plain number once here so the
// frontend never has to parse a Decimal string/structure. Same pattern as
// AiAgentModelsService.toResponse.
function toSessionResponse<T extends SessionRow>(session: T) {
  return {
    ...session,
    price: session.price.toNumber(),
    memberPrice: session.memberPrice ? session.memberPrice.toNumber() : null,
  };
}

// Picks the one session that best represents "when this event is happening" for the admin
// list — the soonest not-yet-started session if there is one, otherwise the most recently
// ended one. Also doubles as the admin list's sort key (see findAllForAdmin): Prisma can't
// order by a value computed across the sessions relation, so this runs in JS instead.
// WEBINAR sessions (no date at all) are excluded up front — they can't anchor a sort position,
// same as an Event with zero sessions.
function pickAnchorSession<
  T extends { startDateTime: Date | null; endDateTime: Date | null },
>(sessions: T[]) {
  const dated = sessions.filter(
    (s): s is T & { startDateTime: Date; endDateTime: Date } =>
      s.startDateTime !== null && s.endDateTime !== null,
  );
  if (dated.length === 0) return null;
  const now = Date.now();
  const upcoming = dated.filter((s) => s.startDateTime.getTime() > now);
  if (upcoming.length > 0) {
    const soonest = upcoming.reduce((a, b) =>
      a.startDateTime.getTime() <= b.startDateTime.getTime() ? a : b,
    );
    return { session: soonest, hasUpcoming: true as const };
  }
  const mostRecent = dated.reduce((a, b) =>
    a.endDateTime.getTime() >= b.endDateTime.getTime() ? a : b,
  );
  return { session: mostRecent, hasUpcoming: false as const };
}

// Kuala Lumpur is a fixed UTC+8 offset with no DST, so month boundaries can be built by
// appending a literal "+08:00" to the constructed date string instead of pulling in a
// timezone library. `end` is an exclusive upper bound (start of the following month).
function getMonthRangeInKL(monthParam?: string) {
  // Shift by the fixed +8 offset before reading UTC fields, so the fallback (no monthParam)
  // resolves to KL's current calendar month, not UTC's — the two disagree for 8 hours a day.
  const klNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const [year, month] = monthParam
    ? (monthParam.split('-').map(Number) as [number, number])
    : [klNow.getUTCFullYear(), klNow.getUTCMonth() + 1];
  const start = new Date(
    `${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`,
  );
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = new Date(
    `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+08:00`,
  );
  return { start, end };
}

type EffectiveSessionState = {
  sessionType: SessionType;
  startDateTime: Date | null;
  endDateTime: Date | null;
  venue?: string | null;
  venueMapLink?: string | null;
  landingPageLink?: string | null;
  status: SessionStatus;
};

// Single source of truth for the sessionType-conditional invariants (date requirement/ordering,
// venue/landingPageLink requirement, WEBINAR's restricted status set) — called with the DTO's
// own fields on create (nothing to merge yet) and with the merged "effective" state on update
// (see updateSession's merge-then-validate), so a future rule change is made in exactly one
// place instead of needing to stay in sync across both flows.
function assertSessionInvariants(s: EffectiveSessionState) {
  if (
    s.sessionType !== SessionType.WEBINAR &&
    (!s.startDateTime || !s.endDateTime)
  ) {
    throw new BadRequestException(
      'startDateTime/endDateTime are required for ONLINE/OFFLINE sessions',
    );
  }
  if (s.startDateTime && s.endDateTime && s.endDateTime <= s.startDateTime) {
    throw new BadRequestException('endDateTime must be after startDateTime');
  }
  if (s.sessionType === SessionType.OFFLINE && !s.venue) {
    throw new BadRequestException('venue is required for OFFLINE sessions');
  }
  if (s.sessionType === SessionType.OFFLINE && !s.venueMapLink) {
    throw new BadRequestException(
      'venueMapLink is required for OFFLINE sessions',
    );
  }
  if (s.sessionType === SessionType.WEBINAR && !s.landingPageLink) {
    throw new BadRequestException(
      'landingPageLink is required for WEBINAR sessions',
    );
  }
  if (
    s.sessionType === SessionType.WEBINAR &&
    s.status !== SessionStatus.OPEN &&
    s.status !== SessionStatus.CLOSED
  ) {
    throw new BadRequestException(
      'WEBINAR sessions can only be OPEN or CLOSED',
    );
  }
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private lastClosedAt = 0;

  constructor(private prisma: PrismaService) {}

  // Persists the "expired" determination instead of just filtering it out at query time —
  // called at the top of every method that reads sessions, so status stays reasonably fresh
  // without needing a cron job. Throttled to at most once per CLOSE_EXPIRED_SESSIONS_INTERVAL_MS
  // regardless of how many requests call it — public/anonymous traffic must never turn this into a
  // write-per-request. The public read methods' own sessionWhere filters on endDateTime
  // directly, so correctness during the throttle window never depends on this having run
  // recently. Errors are swallowed (never thrown): this is background maintenance riding along
  // on a read request, and a transient DB blip here must never turn a GET into a 500 — the next
  // read (or the throttle window elapsing) retries it naturally.
  private async closeExpiredSessions() {
    const now = Date.now();
    if (now - this.lastClosedAt < CLOSE_EXPIRED_SESSIONS_INTERVAL_MS) return;
    this.lastClosedAt = now;
    try {
      await this.prisma.eventSession.updateMany({
        where: {
          endDateTime: { lt: new Date() },
          status: { not: SessionStatus.CLOSED },
        },
        data: { status: SessionStatus.CLOSED },
      });
    } catch (err) {
      this.logger.warn('Failed to close expired event sessions', err as Error);
    }
  }

  // ---- public / browsable — same for every role EXCEPT a SUPER_ADMIN caller also sees
  // Draft events (the actor comes from OptionalJwtAuthGuard, which never blocks the request —
  // it's undefined for anonymous visitors and for any non-SUPER_ADMIN role gets the same
  // PUBLISHED-only view as everyone else) ----

  async findPublished(query: EventsQueryDto, actor?: { role: Role }) {
    await this.closeExpiredSessions();
    const { start, end } = getMonthRangeInKL(query.month);
    // Shared between the outer "does this Event have a visible session" check and the inner
    // "which sessions to actually include" filter — must stay identical or an Event can show
    // up with a session list that doesn't match why it was included. The endDateTime check
    // (not just `status`) is what keeps this correct even inside closeExpiredSessions'
    // throttle window, when a just-expired session's status may not be CLOSED yet.
    const sessionWhere: Prisma.EventSessionWhereInput = {
      status: { not: SessionStatus.CLOSED },
      AND: [
        // WEBINAR sessions have no date at all — they're not scoped to any month, so they
        // pass through every month's fetch. ONLINE/OFFLINE match on interval overlap (starts
        // before the month ends AND ends after the month starts), not just "starts in this
        // month" — a session that starts in July and runs into August must still show up when
        // browsing August.
        {
          OR: [
            { startDateTime: null },
            {
              AND: [
                { startDateTime: { lt: end } },
                { endDateTime: { gt: start } },
              ],
            },
          ],
        },
        // WEBINAR (no endDateTime) never time-expires this way — only a manual status change
        // closes one. ONLINE/OFFLINE are excluded once their end time has passed.
        { OR: [{ endDateTime: null }, { endDateTime: { gte: new Date() } }] },
      ],
      ...(query.country ? { country: query.country } : {}),
    };

    const events = await this.prisma.event.findMany({
      where: {
        ...(actor?.role === Role.SUPER_ADMIN
          ? {}
          : { status: ContentStatus.PUBLISHED }),
        sessions: { some: sessionWhere },
        ...(query.category
          ? { categories: { some: { id: query.category } } }
          : {}),
      },
      include: {
        categories: true,
        sessions: {
          where: sessionWhere,
          include: { speakers: SPEAKER_SELECT },
          // Secondary key only ever breaks ties among null startDateTime rows (WEBINAR) —
          // never changes the order of dated ONLINE/OFFLINE sessions.
          orderBy: [{ startDateTime: 'asc' }, { createdAt: 'desc' }],
        },
      },
    });

    const mapped = events.map((e) => ({
      ...e,
      sessions: e.sessions.map(toSessionResponse),
    }));

    // Prisma's orderBy has no _min aggregation over a one-to-many relation, so "earliest
    // upcoming session first" is sorted here in JS — the result set is already scoped to one
    // month, so this is small and doesn't need a raw SQL query. WEBINAR sessions (no date) are
    // excluded from the min — an Event with only Webinar sessions has nothing to sort by, so
    // it sorts last (Infinity); ties within that group (e.g. two all-Webinar Events) break by
    // createdAt descending — newest first — instead of an arbitrary DB return order.
    const earliestStart = (sessions: { startDateTime: Date | null }[]) => {
      const times = sessions
        .filter((s) => s.startDateTime)
        .map((s) => (s.startDateTime as Date).getTime());
      return times.length ? Math.min(...times) : Infinity;
    };
    return mapped.sort((a, b) => {
      const diff = earliestStart(a.sessions) - earliestStart(b.sessions);
      return diff !== 0 ? diff : b.createdAt.getTime() - a.createdAt.getTime();
    });
  }

  async findOnePublished(id: string, actor?: { role: Role }) {
    await this.closeExpiredSessions();
    // endDateTime (not just `status`) keeps this correct inside closeExpiredSessions' throttle
    // window — see the identical comment in findPublished.
    const sessionWhere: Prisma.EventSessionWhereInput = {
      status: { not: SessionStatus.CLOSED },
      OR: [{ endDateTime: null }, { endDateTime: { gte: new Date() } }],
    };
    // Top-level status: PUBLISHED is required for everyone except a SUPER_ADMIN caller (see
    // findPublished) — this is otherwise an unauthenticated public endpoint, so a guessed/leaked
    // DRAFT Event id must 404 for anyone else, not reveal unpublished content.
    const event = await this.prisma.event.findFirstOrThrow({
      where: {
        id,
        ...(actor?.role === Role.SUPER_ADMIN
          ? {}
          : { status: ContentStatus.PUBLISHED }),
      },
      include: {
        categories: true,
        sessions: {
          where: sessionWhere,
          include: { speakers: SPEAKER_SELECT },
          orderBy: { startDateTime: 'asc' },
        },
      },
    });
    return {
      ...event,
      landingContent: event.landingContent as unknown as LandingContent,
      sessions: event.sessions.map(toSessionResponse),
    };
  }

  // ---- admin (SUPER_ADMIN only, enforced by the controller's guards) ----

  async findAllForAdmin(query: EventsAdminQueryDto) {
    await this.closeExpiredSessions();
    const events = await this.prisma.event.findMany({
      where: query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {},
      include: { sessions: { include: { speakers: SPEAKER_SELECT } } },
    });

    // Sorted here in JS (see pickAnchorSession) rather than via Prisma orderBy — Event count is
    // platform-level, not per-tenant, so pulling the full matching set before slicing is fine.
    const withAnchor = events.map((event) => ({
      event,
      anchor: pickAnchorSession(event.sessions),
    }));
    withAnchor.sort((a, b) => {
      // Neither has a dated session to anchor on (no sessions at all, or Webinar-only) — break
      // the tie by createdAt descending (newest first) instead of an arbitrary DB return order.
      if (!a.anchor && !b.anchor) {
        return b.event.createdAt.getTime() - a.event.createdAt.getTime();
      }
      if (!a.anchor) return 1; // no sessions at all sorts last
      if (!b.anchor) return -1;
      if (a.anchor.hasUpcoming !== b.anchor.hasUpcoming) {
        return a.anchor.hasUpcoming ? -1 : 1; // upcoming events before past-only ones
      }
      return a.anchor.hasUpcoming
        ? a.anchor.session.startDateTime.getTime() -
            b.anchor.session.startDateTime.getTime() // soonest-upcoming first
        : b.anchor.session.endDateTime.getTime() -
            a.anchor.session.endDateTime.getTime(); // most-recently-ended first
    });

    const { page, pageSize } = query;
    const total = withAnchor.length;
    const pageItems = withAnchor.slice((page - 1) * pageSize, page * pageSize);

    return {
      data: pageItems.map(({ event, anchor }) => ({
        ...event,
        sessions: event.sessions.map(toSessionResponse),
        nearestSession: anchor ? toSessionResponse(anchor.session) : null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findOneForAdmin(id: string) {
    await this.closeExpiredSessions();
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id },
      include: {
        categories: true,
        sessions: {
          include: { speakers: SPEAKER_SELECT },
          orderBy: { startDateTime: 'asc' },
        },
      },
    });
    return {
      ...event,
      landingContent: event.landingContent as unknown as LandingContent,
      sessions: event.sessions.map(toSessionResponse),
    };
  }

  createEvent(dto: CreateEventDto, actor: { userId: string }) {
    const { categories, landingContent, ...rest } = dto;
    return this.prisma.event.create({
      data: {
        ...rest,
        createdById: actor.userId,
        // Prisma's Json input type wants a plain object (InputJsonValue), not a class-validator
        // DTO instance — round-tripping through JSON strips the class identity.
        ...(landingContent && {
          landingContent: JSON.parse(
            JSON.stringify(landingContent),
          ) as Prisma.InputJsonValue,
        }),
        categories: categories
          ? { connect: categories.map((id) => ({ id })) }
          : undefined,
      },
    });
  }

  async updateEvent(id: string, dto: UpdateEventDto) {
    await this.prisma.event.findUniqueOrThrow({ where: { id } });
    const { categories, landingContent, ...rest } = dto;
    return this.prisma.event.update({
      where: { id },
      data: {
        ...rest,
        ...(landingContent && {
          landingContent: JSON.parse(
            JSON.stringify(landingContent),
          ) as Prisma.InputJsonValue,
        }),
        // `set` replaces the full list — the frontend's multi-select always sends the
        // complete set of selected category ids, never a delta to merge.
        categories: categories
          ? { set: categories.map((id) => ({ id })) }
          : undefined,
      },
    });
  }

  async deleteEvent(id: string) {
    await this.prisma.event.findUniqueOrThrow({ where: { id } });
    await this.prisma.event.delete({ where: { id } });
  }

  async createSession(eventId: string, dto: CreateSessionDto) {
    await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const { speakerIds, status, ...rest } = dto;
    const startDateTime = dto.startDateTime
      ? new Date(dto.startDateTime)
      : null;
    const endDateTime = dto.endDateTime ? new Date(dto.endDateTime) : null;
    // A WEBINAR with no status sent must still land on OPEN, not the schema's PLANNING
    // default — assertSessionInvariants below rejects PLANNING for WEBINAR, so create must
    // never produce a session update would immediately consider invalid.
    const resolvedStatus =
      status ??
      (dto.sessionType === SessionType.WEBINAR
        ? SessionStatus.OPEN
        : SessionStatus.PLANNING);
    assertSessionInvariants({
      sessionType: dto.sessionType,
      startDateTime,
      endDateTime,
      venue: dto.venue,
      venueMapLink: dto.venueMapLink,
      landingPageLink: dto.landingPageLink,
      status: resolvedStatus,
    });
    const session = await this.prisma.eventSession.create({
      data: {
        ...rest,
        eventId,
        status: resolvedStatus,
        // Both are only required for ONLINE/OFFLINE (see assertSessionInvariants above) — a
        // WEBINAR without one just stores null.
        startDateTime,
        endDateTime,
        speakers: speakerIds
          ? { connect: speakerIds.map((id) => ({ id })) }
          : undefined,
      },
    });
    return toSessionResponse(session);
  }

  async updateSession(sessionId: string, dto: UpdateSessionDto) {
    const existing = await this.prisma.eventSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    // Merge-then-validate: UpdateSessionDto's own decorators only see fields present on THIS
    // request. A PATCH that sends only startDateTime must still be checked against the
    // existing endDateTime (and vice-versa), otherwise a partial update can silently create
    // a start > end inversion that no DTO-level decorator could have caught. Same merge logic
    // for the type-conditional required fields — a PATCH that flips sessionType to OFFLINE
    // without also supplying venue must be rejected here, since CreateSessionDto's fields only
    // ever see the create payload, never a PATCH body.
    const effectiveType = dto.sessionType ?? existing.sessionType;
    const effectiveStart = dto.startDateTime
      ? new Date(dto.startDateTime)
      : existing.startDateTime;
    const effectiveEnd = dto.endDateTime
      ? new Date(dto.endDateTime)
      : existing.endDateTime;
    const effectiveVenue = dto.venue !== undefined ? dto.venue : existing.venue;
    const effectiveVenueMapLink =
      dto.venueMapLink !== undefined ? dto.venueMapLink : existing.venueMapLink;
    const effectiveLandingPageLink =
      dto.landingPageLink !== undefined
        ? dto.landingPageLink
        : existing.landingPageLink;
    const effectiveStatus = dto.status ?? existing.status;
    assertSessionInvariants({
      sessionType: effectiveType,
      startDateTime: effectiveStart,
      endDateTime: effectiveEnd,
      venue: effectiveVenue,
      venueMapLink: effectiveVenueMapLink,
      landingPageLink: effectiveLandingPageLink,
      status: effectiveStatus,
    });

    const { speakerIds, ...rest } = dto;
    const session = await this.prisma.eventSession.update({
      where: { id: sessionId },
      data: {
        ...rest,
        // undefined (key omitted) = leave as-is; null/empty (key present but falsy) =
        // explicit clear, e.g. flipping to WEBINAR and blanking the date inputs.
        startDateTime:
          dto.startDateTime !== undefined
            ? dto.startDateTime
              ? new Date(dto.startDateTime)
              : null
            : undefined,
        endDateTime:
          dto.endDateTime !== undefined
            ? dto.endDateTime
              ? new Date(dto.endDateTime)
              : null
            : undefined,
        // Same explicit-clear rule as the dates above: switching away from OFFLINE/WEBINAR must
        // null out the field that no longer applies, not silently keep whatever was there before
        // (effectiveVenue/effectiveVenueMapLink/effectiveLandingPageLink above are for validation
        // only — `...rest` alone would leave these columns untouched since the frontend omits
        // them entirely rather than sending null).
        venue: effectiveType !== SessionType.OFFLINE ? null : dto.venue,
        venueMapLink:
          effectiveType !== SessionType.OFFLINE ? null : dto.venueMapLink,
        landingPageLink:
          effectiveType !== SessionType.WEBINAR ? null : dto.landingPageLink,
        speakers: speakerIds
          ? { set: speakerIds.map((id) => ({ id })) }
          : undefined,
      },
    });
    return toSessionResponse(session);
  }

  async deleteSession(sessionId: string) {
    await this.prisma.eventSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    await this.prisma.eventSession.delete({ where: { id: sessionId } });
  }
}
