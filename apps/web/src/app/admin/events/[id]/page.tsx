'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Reorder, useDragControls } from 'framer-motion';
import type { DragControls } from 'framer-motion';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteDialog, Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { COUNTRIES } from '@/lib/countries';
import type { LandingContent } from '@/lib/eventLandingContent';
import { formatSessionTime, fromKLInputValue, toKLInputValue } from '@/lib/eventTime';
import { fetchVimeoVideoInfo } from '@/lib/vimeo';
import { extractYoutubeId, youtubeEmbedUrl, youtubeThumbnailUrl } from '@/lib/youtube';

type SessionType = 'WEBINAR' | 'ONLINE' | 'OFFLINE';
type SessionStatus = 'OPEN' | 'PLANNING' | 'SCHEDULED' | 'SELLING_FAST' | 'LAST_FEW_SEATS' | 'FULL' | 'CLOSED';

type Session = {
  id: string;
  sessionType: SessionType;
  // Only ever null for WEBINAR — it has no date at all. Always set for ONLINE/OFFLINE.
  startDateTime: string | null;
  endDateTime: string | null;
  venue: string | null;
  venueMapLink: string | null;
  country: string | null;
  // Only meaningful for WEBINAR — its own registration/landing page.
  landingPageLink: string | null;
  price: number;
  memberPrice: number | null;
  status: SessionStatus;
  speakers: { id: string; name: string }[];
};

type Event = {
  id: string;
  title: string;
  // Templated, admin-editable landing page content for every ONLINE/OFFLINE session card under
  // this Event (see the "Landing Content" card below).
  landingContent: LandingContent;
  description: string | null;
  thumbnail: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  categories: { id: string; name: string }[];
  sessions: Session[];
};

const SESSION_TYPE_OPTIONS = [
  { value: 'WEBINAR', label: 'Webinar' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'OFFLINE', label: 'Offline' },
];

const SESSION_STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'PLANNING', label: 'Planning' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'SELLING_FAST', label: 'Selling Fast' },
  { value: 'LAST_FEW_SEATS', label: 'Last Few Seats' },
  { value: 'FULL', label: 'Full' },
  { value: 'CLOSED', label: 'Closed' },
];

// WEBINAR is free and uncapped — the other marketing labels above don't apply, it's only ever
// open (before it expires) or closed (expired, or cancelled early by an admin).
const WEBINAR_STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
];

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name }));

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

// Shape shared by the "add session" form and SessionEditor — kept as plain state fields
// (not a single object) to match the rest of this codebase's form conventions.
function emptySessionForm() {
  return {
    sessionType: 'WEBINAR' as SessionType,
    startDateTime: '',
    endDateTime: '',
    venue: '',
    venueMapLink: '',
    country: 'MY', // Most sessions are Malaysia-based — new sessions default to it, not blank.
    landingPageLink: '',
    price: '',
    memberPrice: '',
    // Default sessionType above is WEBINAR, which only ever allows OPEN/CLOSED — default status
    // has to match or the Status select would start on a value not in its own options list.
    status: 'OPEN' as SessionStatus,
    speakerIds: [] as string[],
  };
}

function sessionPayload(form: ReturnType<typeof emptySessionForm>) {
  const isWebinar = form.sessionType === 'WEBINAR';
  return {
    sessionType: form.sessionType,
    // WEBINAR has no date — send null (not undefined) so a PATCH can explicitly clear a date
    // left over from before the session was switched to WEBINAR, not just leave it untouched.
    startDateTime: isWebinar
      ? form.startDateTime
        ? fromKLInputValue(form.startDateTime).toISOString()
        : null
      : fromKLInputValue(form.startDateTime).toISOString(),
    endDateTime: isWebinar
      ? form.endDateTime
        ? fromKLInputValue(form.endDateTime).toISOString()
        : null
      : fromKLInputValue(form.endDateTime).toISOString(),
    venue: form.sessionType === 'OFFLINE' ? form.venue || undefined : undefined,
    venueMapLink: form.sessionType === 'OFFLINE' ? form.venueMapLink || undefined : undefined,
    country: form.sessionType === 'WEBINAR' ? undefined : form.country || undefined,
    landingPageLink: form.sessionType === 'WEBINAR' ? form.landingPageLink || undefined : undefined,
    price: form.price ? Number(form.price) : undefined,
    memberPrice: form.memberPrice ? Number(form.memberPrice) : undefined,
    status: form.status,
    speakerIds: form.sessionType === 'WEBINAR' ? [] : form.speakerIds,
  };
}

// Reorder (framer-motion) needs a stable identity per row to track drag position — plain
// strings/freshly-added objects have no natural id, so every row in local form state is wrapped
// with a synthetic key (crypto.randomUUID(), generated both on "Add" and when converting the
// loaded landingContent arrays into this shape), and unwrapped back to plain values only when
// building the save payload.
type Row<T> = { key: string; value: T };

function toRows<T>(values: T[]): Row<T>[] {
  return values.map((value) => ({ key: crypto.randomUUID(), value }));
}

function fromRows<T>(rows: Row<T>[]): T[] {
  return rows.map((row) => row.value);
}

type DayForm = { title: string; theme: string; points: Row<string>[]; takeaway: string };
type TestimonialForm = {
  videoUrl: string;
  // Resolved from videoUrl on blur (see resolveTestimonialVideo) — never typed by the admin.
  thumbnailUrl: string;
  embedUrl: string;
  name: string;
  role: string;
  quote: string;
  // Set when the last resolution attempt for this row failed — cleared on the next successful
  // resolution. Distinct from landingErrors (submit-time validation) so a bad link is flagged
  // the moment the admin leaves the field, not just at save time.
  resolutionError: string;
};

type LandingForm = {
  heroName: string;
  heroTitle: string;
  heroCredentials: Row<string>[];
  heroPhotoUrl: string;
  courseTitle: string;
  courseSubtitle: string;
  days: Row<DayForm>[];
  testimonials: Row<TestimonialForm>[];
  gallery: Row<string>[];
};

function emptyLandingForm(content: LandingContent): LandingForm {
  return {
    heroName: content.hero.name,
    heroTitle: content.hero.title,
    heroCredentials: toRows(content.hero.credentials),
    heroPhotoUrl: content.hero.photoUrl,
    courseTitle: content.course.title,
    courseSubtitle: content.course.subtitle,
    days: toRows(
      content.course.days.map((day) => ({
        title: day.title,
        theme: day.theme,
        points: toRows(day.points),
        takeaway: day.takeaway,
      })),
    ),
    testimonials: toRows(content.testimonials.map((t) => ({ ...t, resolutionError: '' }))),
    gallery: toRows(content.gallery),
  };
}

// Cleans up the form right before submit: trims every value, drops fully-blank rows outright (an
// admin-added-then-abandoned empty row was never meaningful content), and leaves a partially
// filled row's required fields blank so validateLandingForm can block the save with an inline
// error on that specific field rather than sending an incomplete object the backend 400s on.
function landingPayload(form: LandingForm): LandingContent {
  return {
    hero: {
      name: form.heroName.trim(),
      title: form.heroTitle.trim(),
      credentials: fromRows(form.heroCredentials)
        .map((c) => c.trim())
        .filter(Boolean),
      photoUrl: form.heroPhotoUrl.trim(),
    },
    course: {
      title: form.courseTitle.trim(),
      subtitle: form.courseSubtitle.trim(),
      days: fromRows(form.days)
        .map((day) => ({
          title: day.title.trim(),
          theme: day.theme.trim(),
          points: fromRows(day.points)
            .map((p) => p.trim())
            .filter(Boolean),
          takeaway: day.takeaway.trim(),
        }))
        .filter((day) => day.title || day.theme || day.takeaway || day.points.length > 0),
    },
    testimonials: fromRows(form.testimonials)
      .map((t) => ({
        videoUrl: t.videoUrl.trim(),
        thumbnailUrl: t.thumbnailUrl.trim(),
        embedUrl: t.embedUrl.trim(),
        name: t.name.trim(),
        role: t.role.trim(),
        quote: t.quote.trim(),
      }))
      .filter((t) => t.videoUrl || t.name || t.role || t.quote),
    gallery: fromRows(form.gallery)
      .map((g) => g.trim())
      .filter(Boolean),
  };
}

// Keyed by either a fixed top-level field id ("heroName") or `${rowKey}.field` for a row inside
// an array — the same keys StringRowList/DayCard/TestimonialCard read to show an inline error.
// A row with every field blank is treated as "not in use" (silently dropped by landingPayload,
// not an error) — only a row with SOME content but a missing required field blocks the save.
function validateLandingForm(form: LandingForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const REQUIRED = 'This field is required';

  if (!form.heroName.trim()) errors.heroName = REQUIRED;
  if (!form.heroTitle.trim()) errors.heroTitle = REQUIRED;
  if (!form.heroPhotoUrl.trim()) errors.heroPhotoUrl = REQUIRED;
  if (!form.courseTitle.trim()) errors.courseTitle = REQUIRED;
  if (!form.courseSubtitle.trim()) errors.courseSubtitle = REQUIRED;

  for (const day of form.days) {
    const { title, theme, takeaway, points } = day.value;
    const inUse = title.trim() || theme.trim() || takeaway.trim() || points.some((p) => p.value.trim());
    if (!inUse) continue;
    if (!title.trim()) errors[`${day.key}.title`] = REQUIRED;
    if (!theme.trim()) errors[`${day.key}.theme`] = REQUIRED;
    if (!takeaway.trim()) errors[`${day.key}.takeaway`] = REQUIRED;
  }

  for (const t of form.testimonials) {
    const { videoUrl, name, role, quote, thumbnailUrl, embedUrl } = t.value;
    const inUse = videoUrl.trim() || name.trim() || role.trim() || quote.trim();
    if (!inUse) continue;
    if (!name.trim()) errors[`${t.key}.name`] = REQUIRED;
    if (!role.trim()) errors[`${t.key}.role`] = REQUIRED;
    if (!quote.trim()) errors[`${t.key}.quote`] = REQUIRED;
    if (!videoUrl.trim()) {
      errors[`${t.key}.videoUrl`] = REQUIRED;
    } else if (!thumbnailUrl.trim() || !embedUrl.trim()) {
      errors[`${t.key}.videoUrl`] = 'This video link has not resolved yet — check the link or try again';
    }
  }

  return errors;
}

export default function EditEventPage() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const eventId = params.id;

  const [event, setEvent] = useState<Event | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  const [speakerOptions, setSpeakerOptions] = useState<{ value: string; label: string }[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptySessionForm());
  const [addError, setAddError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'event' | 'session'; id?: string } | null>(null);

  const [landingForm, setLandingFormRaw] = useState<LandingForm | null>(null);
  const [landingDirty, setLandingDirty] = useState(false);
  const [landingErrors, setLandingErrors] = useState<Record<string, string>>({});
  const [landingSaveError, setLandingSaveError] = useState('');
  const [savingLanding, setSavingLanding] = useState(false);
  // Keyed by testimonial row key — see resolveTestimonialVideo for why this guards against a
  // stale (out-of-order) video resolution overwriting a newer one's result.
  const resolveSeqRef = useRef<Record<string, number>>({});

  // Caps the Sessions panel's height to match the Event panel's actual rendered height (desktop
  // two-column layout only) — grows naturally with session count, then scrolls internally past
  // that point, instead of pushing the page taller than the Event panel next to it. Measured via
  // JS rather than CSS Grid's `items-stretch` (tried first): stretch ties both columns' heights
  // together symmetrically, so a tall Sessions list ends up stretching the Event panel too,
  // which is the opposite of what's wanted here.
  const eventPanelRef = useRef<HTMLDivElement>(null);
  const [sessionsMaxHeight, setSessionsMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = eventPanelRef.current;
    if (!el) return;
    const recompute = () => {
      // Only cap on the lg+ two-column layout — below that, the columns stack vertically and
      // Sessions should just grow naturally like everything else on the page.
      setSessionsMaxHeight(window.innerWidth >= 1024 ? el.offsetHeight : undefined);
    };
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    window.addEventListener('resize', recompute);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [event]);

  const setLandingForm = (updater: (prev: LandingForm) => LandingForm) => {
    setLandingFormRaw((prev) => (prev ? updater(prev) : prev));
    setLandingDirty(true);
  };

  // Fires only while the Landing Content form has unsaved edits, scoped to just this form — the
  // simpler Title/Description/Thumbnail form on this same page has no such guard.
  useEffect(() => {
    if (!landingDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [landingDirty]);

  const load = () => {
    fetch(`${apiUrl}/events/admin/${eventId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: Event) => {
        setEvent(data);
        setTitle(data.title);
        setDescription(data.description ?? '');
        setThumbnail(data.thumbnail ?? '');
        setCategories(data.categories.map((c) => c.id));
        setLandingFormRaw(emptyLandingForm(data.landingContent));
        setLandingDirty(false);
        setLandingErrors({});
        setLandingSaveError('');
      })
      .catch(() => setError('Failed to load event'));
  };

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/admin');
      return;
    }
    if (!user) return;
    load();
    fetch(`${apiUrl}/speakers?pageSize=1000`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: { id: string; name: string }[] }) =>
        setSpeakerOptions(res.data.map((s) => ({ value: s.id, label: s.name }))),
      )
      .catch(() => {});
    fetch(`${apiUrl}/event-categories`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { id: string; name: string }[]) =>
        setCategoryOptions(res.map((c) => ({ value: c.id, label: c.name }))),
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, eventId, router]);

  if (user && user.role !== 'SUPER_ADMIN') return null;
  if (!event) return null;

  const saveMeta = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSavingMeta(true);
    setError('');
    const res = await fetch(`${apiUrl}/events/${eventId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: description || undefined,
        thumbnail: thumbnail || undefined,
        categories,
      }),
    });
    setSavingMeta(false);
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.saved();
    load();
  };

  const saveLanding = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!landingForm) return;
    const errors = validateLandingForm(landingForm);
    if (Object.keys(errors).length > 0) {
      setLandingErrors(errors);
      setLandingSaveError('Please fix the highlighted fields below');
      return;
    }
    setLandingErrors({});
    setLandingSaveError('');
    setSavingLanding(true);
    const res = await fetch(`${apiUrl}/events/${eventId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ landingContent: landingPayload(landingForm) }),
    });
    setSavingLanding(false);
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.saved();
    load();
  };

  // Resolves a testimonial's cover photo + playable embed url on blur only (never onChange —
  // matches the existing Lessons/Vimeo-duration precedent, so this never fires per-keystroke). A
  // per-row sequence number discards a resolution whose result comes back after a newer one for
  // the same row already landed, so two quick successive edits can never race and pair the wrong
  // video with the wrong thumbnail.
  const resolveTestimonialVideo = async (rowKey: string, url: string) => {
    const trimmed = url.trim();
    const seq = (resolveSeqRef.current[rowKey] ?? 0) + 1;
    resolveSeqRef.current[rowKey] = seq;
    if (!trimmed) return;

    const applyIfCurrent = (patch: Partial<TestimonialForm>) => {
      if (resolveSeqRef.current[rowKey] !== seq) return;
      setLandingForm((prev) => ({
        ...prev,
        testimonials: prev.testimonials.map((row) =>
          row.key === rowKey ? { ...row, value: { ...row.value, ...patch } } : row,
        ),
      }));
    };

    const youtubeId = extractYoutubeId(trimmed);
    if (youtubeId) {
      applyIfCurrent({
        thumbnailUrl: youtubeThumbnailUrl(youtubeId),
        embedUrl: youtubeEmbedUrl(youtubeId),
        resolutionError: '',
      });
      return;
    }
    const info = await fetchVimeoVideoInfo(trimmed);
    if (info.ok) {
      applyIfCurrent({ thumbnailUrl: info.thumbnailUrl, embedUrl: info.embedUrl, resolutionError: '' });
    } else {
      const message =
        info.reason === 'private_or_embed_disabled'
          ? 'This Vimeo video is private or has embedding disabled — check its privacy settings'
          : 'Could not recognize this as a YouTube or Vimeo link';
      applyIfCurrent({ thumbnailUrl: '', embedUrl: '', resolutionError: message });
    }
  };

  const togglePublish = async () => {
    const status = event.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    await fetch(`${apiUrl}/events/${eventId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const deleteEvent = async () => {
    const res = await fetch(`${apiUrl}/events/${eventId}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
    router.push('/admin/events');
  };

  const deleteSession = async (sessionId: string) => {
    const res = await fetch(`${apiUrl}/events/sessions/${sessionId}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
    load();
  };

  const closeAddSessionDialog = () => {
    setIsAddSessionOpen(false);
    setAddForm(emptySessionForm());
    setAddError('');
  };

  const addSession = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (addForm.sessionType !== 'WEBINAR' && (!addForm.startDateTime || !addForm.endDateTime)) {
      setAddError('Start and end time are required');
      return;
    }
    setAddError('');
    const res = await fetch(`${apiUrl}/events/${eventId}/sessions`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionPayload(addForm)),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setAddError(data?.message ?? 'Failed to create session');
      return;
    }
    toast.saved();
    closeAddSessionDialog();
    load();
  };

  return (
    <AdminLayout
      title="Edit Event"
      backHref="/admin/events"
      subtitle={event.title}
      actions={
        <>
          <Button variant="secondary" onClick={togglePublish}>
            {event.status === 'PUBLISHED' ? 'Published' : 'Draft'}
          </Button>
          <Button
            variant="danger"
            onClick={() => setConfirmDelete({ type: 'event' })}
            leftIcon={<Icon name="trash" className="h-4 w-4 mr-1.5" />}
          >
            Delete
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* max-height comes from measuring the Event panel's actual rendered height in JS (see
            eventPanelRef/sessionsMaxHeight above) — CSS Grid's items-stretch was tried first,
            but stretch ties both columns' heights together symmetrically, so a tall Sessions
            list ends up stretching the Event panel too, the opposite of what's wanted. */}
        <div className="order-2 lg:order-1 lg:col-span-2 space-y-10">
          <div
            className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col"
            style={{ maxHeight: sessionsMaxHeight }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Sessions</h2>
              <Button
                leftIcon={<Icon name="plus" className="h-4 w-4 mr-1.5" />}
                onClick={() => setIsAddSessionOpen(true)}
                size="sm"
                variant="secondary"
              >
                Add
              </Button>
            </div>
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
              {event.sessions.map((session) => (
                <div key={session.id}>
                  <div className="flex items-center px-4 py-3 hover:bg-slate-50">
                    <div className="w-16 shrink-0 mr-4">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {session.sessionType}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="font-medium text-slate-900 truncate">
                        {session.startDateTime && session.endDateTime
                          ? `${formatSessionTime(session.startDateTime)} – ${formatSessionTime(session.endDateTime)}`
                          : 'No date (Webinar)'}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {session.venue && <>{session.venue} · </>}
                        {session.sessionType === 'WEBINAR' || session.price <= 0
                          ? 'Free'
                          : // No memberPrice set at all defaults to free for members, matching SessionCard.
                            `RM${session.price.toFixed(2)} (Members: ${
                              session.memberPrice ? `RM${session.memberPrice.toFixed(2)}` : 'Free'
                            })`}
                      </p>
                      <p className="text-xs text-slate-400">{session.status}</p>
                    </div>
                    <button
                      type="button"
                      className="mr-3 text-slate-400 hover:text-slate-700"
                      onClick={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}
                    >
                      <Icon name={expandedSessionId === session.id ? 'chevrons-left' : 'edit'} className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => setConfirmDelete({ type: 'session', id: session.id })}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                  {expandedSessionId === session.id && (
                    <SessionEditor session={session} speakerOptions={speakerOptions} onSaved={load} />
                  )}
                </div>
              ))}
              {event.sessions.length === 0 && <p className="px-4 py-6 text-center text-slate-400">No sessions yet.</p>}
            </div>

            <Dialog isOpen={isAddSessionOpen} onClose={closeAddSessionDialog} title="Add Session" size="xl">
              <form className="space-y-4" onSubmit={addSession}>
                <SessionFormFields form={addForm} setForm={setAddForm} speakerOptions={speakerOptions} />
                {addError && (
                  <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
                    {addError}
                  </Alert>
                )}
                <Button type="submit">Create Session</Button>
              </form>
            </Dialog>
          </div>
        </div>

        <div ref={eventPanelRef} className="order-1 lg:order-2 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Event</h2>
          <form className="space-y-5" onSubmit={saveMeta} noValidate>
            <Input id="title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <Textarea
              id="description"
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
            <Input
              id="thumbnail"
              label="Thumbnail"
              value={thumbnail}
              onChange={(e) => setThumbnail(e.target.value)}
              placeholder="https://..."
            />
            <SearchableSelect
              id="categories"
              label="Categories"
              multiple
              onChange={setCategories}
              options={categoryOptions}
              placeholder="No categories"
              value={categories}
            />
            {error && (
              <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
                {error}
              </Alert>
            )}
            <Button type="submit" isLoading={savingMeta} loadingLabel="Saving...">
              Save
            </Button>
          </form>
        </div>
      </div>

      {landingForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 mt-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Landing Content</h2>
          <form className="space-y-8" onSubmit={saveLanding} noValidate>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Hero</h3>
              <Input
                id="heroName"
                label="Name"
                value={landingForm.heroName}
                onChange={(e) => setLandingForm((prev) => ({ ...prev, heroName: e.target.value }))}
                error={landingErrors.heroName}
              />
              <Input
                id="heroTitle"
                label="Title"
                value={landingForm.heroTitle}
                onChange={(e) => setLandingForm((prev) => ({ ...prev, heroTitle: e.target.value }))}
                error={landingErrors.heroTitle}
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Credentials</label>
                <StringRowList
                  rows={landingForm.heroCredentials}
                  onReorder={(rows) => setLandingForm((prev) => ({ ...prev, heroCredentials: rows }))}
                  onChangeValue={(key, value) =>
                    setLandingForm((prev) => ({
                      ...prev,
                      heroCredentials: prev.heroCredentials.map((r) => (r.key === key ? { ...r, value } : r)),
                    }))
                  }
                  onRemove={(key) =>
                    setLandingForm((prev) => ({
                      ...prev,
                      heroCredentials: prev.heroCredentials.filter((r) => r.key !== key),
                    }))
                  }
                  onAdd={() =>
                    setLandingForm((prev) => ({
                      ...prev,
                      heroCredentials: [...prev.heroCredentials, { key: crypto.randomUUID(), value: '' }],
                    }))
                  }
                  addLabel="Add credential"
                />
              </div>
              <Input
                id="heroPhotoUrl"
                label="Instructor photo URL"
                value={landingForm.heroPhotoUrl}
                onChange={(e) => setLandingForm((prev) => ({ ...prev, heroPhotoUrl: e.target.value }))}
                placeholder="https://..."
                helperText="Use a stable, hotlink-safe direct image URL"
                error={landingErrors.heroPhotoUrl}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Course</h3>
              <Input
                id="courseTitle"
                label="Title"
                value={landingForm.courseTitle}
                onChange={(e) => setLandingForm((prev) => ({ ...prev, courseTitle: e.target.value }))}
                error={landingErrors.courseTitle}
              />
              <Input
                id="courseSubtitle"
                label="Subtitle"
                value={landingForm.courseSubtitle}
                onChange={(e) => setLandingForm((prev) => ({ ...prev, courseSubtitle: e.target.value }))}
                error={landingErrors.courseSubtitle}
              />
              <Reorder.Group
                axis="y"
                values={landingForm.days}
                onReorder={(rows) => setLandingForm((prev) => ({ ...prev, days: rows }))}
                className="space-y-3"
              >
                {landingForm.days.map((day, i) => (
                  <DayCard
                    key={day.key}
                    row={day}
                    index={i}
                    onChange={(key, updater) =>
                      setLandingForm((prev) => ({
                        ...prev,
                        days: prev.days.map((d) => (d.key === key ? { ...d, value: updater(d.value) } : d)),
                      }))
                    }
                    onRemove={(key) =>
                      setLandingForm((prev) => ({ ...prev, days: prev.days.filter((d) => d.key !== key) }))
                    }
                    errors={landingErrors}
                  />
                ))}
              </Reorder.Group>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setLandingForm((prev) => ({
                    ...prev,
                    days: [
                      ...prev.days,
                      { key: crypto.randomUUID(), value: { title: '', theme: '', points: [], takeaway: '' } },
                    ],
                  }))
                }
              >
                Add Day
              </Button>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Testimonials</h3>
              <Reorder.Group
                axis="y"
                values={landingForm.testimonials}
                onReorder={(rows) => setLandingForm((prev) => ({ ...prev, testimonials: rows }))}
                className="space-y-3"
              >
                {landingForm.testimonials.map((t, i) => (
                  <TestimonialCard
                    key={t.key}
                    row={t}
                    index={i}
                    onChange={(key, updater) =>
                      setLandingForm((prev) => ({
                        ...prev,
                        testimonials: prev.testimonials.map((r) =>
                          r.key === key ? { ...r, value: updater(r.value) } : r,
                        ),
                      }))
                    }
                    onRemove={(key) =>
                      setLandingForm((prev) => ({
                        ...prev,
                        testimonials: prev.testimonials.filter((r) => r.key !== key),
                      }))
                    }
                    onResolve={resolveTestimonialVideo}
                    errors={landingErrors}
                  />
                ))}
              </Reorder.Group>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setLandingForm((prev) => ({
                    ...prev,
                    testimonials: [
                      ...prev.testimonials,
                      {
                        key: crypto.randomUUID(),
                        value: {
                          videoUrl: '',
                          thumbnailUrl: '',
                          embedUrl: '',
                          name: '',
                          role: '',
                          quote: '',
                          resolutionError: '',
                        },
                      },
                    ],
                  }))
                }
              >
                Add Testimonial
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-700">Gallery photos</h3>
              <StringRowList
                rows={landingForm.gallery}
                onReorder={(rows) => setLandingForm((prev) => ({ ...prev, gallery: rows }))}
                onChangeValue={(key, value) =>
                  setLandingForm((prev) => ({
                    ...prev,
                    gallery: prev.gallery.map((r) => (r.key === key ? { ...r, value } : r)),
                  }))
                }
                onRemove={(key) =>
                  setLandingForm((prev) => ({ ...prev, gallery: prev.gallery.filter((r) => r.key !== key) }))
                }
                onAdd={() =>
                  setLandingForm((prev) => ({
                    ...prev,
                    gallery: [...prev.gallery, { key: crypto.randomUUID(), value: '' }],
                  }))
                }
                addLabel="Add photo"
                placeholder="https://..."
                firstRowNote="Cover photo (drag to reorder — the first row shows as the large tile)"
              />
              <p className="text-xs text-slate-400">Use stable, hotlink-safe direct image URLs</p>
            </div>

            {landingSaveError && (
              <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
                {landingSaveError}
              </Alert>
            )}
            <Button type="submit" isLoading={savingLanding} loadingLabel="Saving...">
              Save Landing Content
            </Button>
          </form>
        </div>
      )}

      <ConfirmDeleteDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete?.type === 'event') deleteEvent();
          if (confirmDelete?.type === 'session' && confirmDelete.id) deleteSession(confirmDelete.id);
        }}
        title={confirmDelete?.type === 'event' ? 'Delete Event' : 'Delete Session'}
        userEmail={user?.email ?? ''}
      />
    </AdminLayout>
  );
}

// Shared field set for both the "add session" form and the inline session editor —
// the sessionType choice drives which of venue/venueMapLink (OFFLINE) vs. landingPageLink
// (WEBINAR) is shown, matching EventsService's own type-conditional required-field rule on
// the backend. ONLINE needs neither — its cards link to the parent Event's landingPageLink.
function SessionFormFields({
  form,
  setForm,
  speakerOptions,
}: {
  form: ReturnType<typeof emptySessionForm>;
  setForm: (updater: (prev: ReturnType<typeof emptySessionForm>) => ReturnType<typeof emptySessionForm>) => void;
  speakerOptions: { value: string; label: string }[];
}) {
  const set = <K extends keyof ReturnType<typeof emptySessionForm>>(key: K, value: ReturnType<typeof emptySessionForm>[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <>
      <RadioGroup
        label="Type"
        name="sessionType"
        onChange={(value) => {
          const sessionType = value as SessionType;
          set('sessionType', sessionType);
          // WEBINAR only allows OPEN/CLOSED — snap out of whatever marketing status was picked
          // under the previous type, since it may not be one of those two.
          if (sessionType === 'WEBINAR' && form.status !== 'OPEN' && form.status !== 'CLOSED') {
            set('status', 'OPEN');
          }
        }}
        options={SESSION_TYPE_OPTIONS}
        value={form.sessionType}
      />
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <Input
            id="startDateTime"
            label={form.sessionType === 'WEBINAR' ? 'Start (optional, Malaysia time)' : 'Start (Malaysia time)'}
            onChange={(e) => set('startDateTime', e.target.value)}
            type="datetime-local"
            value={form.startDateTime}
            required={form.sessionType !== 'WEBINAR'}
          />
        </div>
        <div className="flex-1 min-w-0">
          <Input
            id="endDateTime"
            label={form.sessionType === 'WEBINAR' ? 'End (optional, Malaysia time)' : 'End (Malaysia time)'}
            onChange={(e) => set('endDateTime', e.target.value)}
            type="datetime-local"
            value={form.endDateTime}
            required={form.sessionType !== 'WEBINAR'}
          />
        </div>
      </div>
      {form.sessionType === 'OFFLINE' && (
        <>
          <Input id="venue" label="Venue" onChange={(e) => set('venue', e.target.value)} value={form.venue} required />
          <Input
            id="venueMapLink"
            label="Venue Map Link"
            onChange={(e) => set('venueMapLink', e.target.value)}
            placeholder="https://maps.google.com/..."
            value={form.venueMapLink}
            required
          />
        </>
      )}
      {form.sessionType === 'WEBINAR' && (
        <Input
          id="landingPageLink"
          label="Landing Page Link"
          onChange={(e) => set('landingPageLink', e.target.value)}
          placeholder="https://..."
          value={form.landingPageLink}
          required
        />
      )}
      {form.sessionType !== 'WEBINAR' && (
        <SearchableSelect
          id="country"
          label="Country"
          onChange={(value) => set('country', value)}
          options={COUNTRY_OPTIONS}
          placeholder="No country"
          value={form.country}
        />
      )}
      {form.sessionType !== 'WEBINAR' && (
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <Input
              id="price"
              label="Price (non-member)"
              onChange={(e) => set('price', e.target.value)}
              type="number"
              min="0"
              step="0.01"
              value={form.price}
            />
          </div>
          <div className="flex-1 min-w-0">
            <Input
              id="memberPrice"
              label="Member price"
              onChange={(e) => set('memberPrice', e.target.value)}
              type="number"
              min="0"
              step="0.01"
              value={form.memberPrice}
            />
          </div>
        </div>
      )}
      <SearchableSelect
        id="status"
        label="Status"
        onChange={(value) => set('status', value as SessionStatus)}
        options={form.sessionType === 'WEBINAR' ? WEBINAR_STATUS_OPTIONS : SESSION_STATUS_OPTIONS}
        value={form.status}
      />
      {form.sessionType !== 'WEBINAR' && (
        <SearchableSelect
          id="speakerIds"
          label="Speakers"
          multiple
          onChange={(value) => set('speakerIds', value)}
          options={speakerOptions}
          placeholder="No speakers"
          value={form.speakerIds}
        />
      )}
    </>
  );
}

function SessionEditor({
  session,
  speakerOptions,
  onSaved,
}: {
  session: Session;
  speakerOptions: { value: string; label: string }[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    sessionType: session.sessionType,
    startDateTime: session.startDateTime ? toKLInputValue(session.startDateTime) : '',
    endDateTime: session.endDateTime ? toKLInputValue(session.endDateTime) : '',
    venue: session.venue ?? '',
    venueMapLink: session.venueMapLink ?? '',
    country: session.country ?? '',
    landingPageLink: session.landingPageLink ?? '',
    price: String(session.price),
    memberPrice: session.memberPrice != null ? String(session.memberPrice) : '',
    status: session.status,
    speakerIds: session.speakers.map((s) => s.id),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (form.sessionType !== 'WEBINAR' && (!form.startDateTime || !form.endDateTime)) {
      setError('Start and end time are required');
      return;
    }
    setSaving(true);
    setError('');
    const res = await fetch(`${apiUrl}/events/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionPayload(form)),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? 'Failed to save session');
      return;
    }
    toast.saved();
    onSaved();
  };

  return (
    <form className="space-y-4 border-t border-slate-100 bg-slate-50 px-4 py-4" onSubmit={save}>
      <SessionFormFields form={form} setForm={setForm} speakerOptions={speakerOptions} />
      {error && (
        <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
          {error}
        </Alert>
      )}
      <Button type="submit" size="sm" isLoading={saving} loadingLabel="Saving...">
        Save
      </Button>
    </form>
  );
}

// Reusable drag handle — stops propagation before starting the drag, which is what actually
// keeps a nested drag (e.g. a day's points list inside the outer days list) from also being
// misread as a drag of its enclosing Reorder.Item.
function DragHandle({ dragControls }: { dragControls: DragControls }) {
  return (
    <span
      onPointerDown={(e) => {
        e.stopPropagation();
        dragControls.start(e);
      }}
      className="shrink-0 cursor-grab select-none text-slate-300 active:cursor-grabbing"
    >
      ⠿
    </span>
  );
}

// Generic reorderable list of plain string rows — used for hero credentials, each day's points,
// and gallery photo URLs. dragListener={false} + useDragControls (via DragHandle) confines the
// drag gesture to the handle itself, matching the nested-drag-isolation approach used everywhere
// in this feature (see DayCard, which nests this list inside its own Reorder.Item).
function StringRow({
  row,
  onChangeValue,
  onRemove,
  placeholder,
  note,
}: {
  row: Row<string>;
  onChangeValue: (key: string, value: string) => void;
  onRemove: (key: string) => void;
  placeholder?: string;
  note?: string;
}) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item value={row} dragListener={false} dragControls={dragControls}>
      {note && <p className="mb-1 text-xs text-indigo-600">{note}</p>}
      <div className="flex items-center gap-2">
        <DragHandle dragControls={dragControls} />
        <div className="min-w-0 flex-1">
          <Input
            id={`row-${row.key}`}
            value={row.value}
            onChange={(e) => onChangeValue(row.key, e.target.value)}
            placeholder={placeholder}
          />
        </div>
        <button type="button" onClick={() => onRemove(row.key)} className="shrink-0 text-red-400 hover:text-red-600">
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>
    </Reorder.Item>
  );
}

function StringRowList({
  rows,
  onReorder,
  onChangeValue,
  onRemove,
  onAdd,
  addLabel,
  placeholder,
  firstRowNote,
}: {
  rows: Row<string>[];
  onReorder: (rows: Row<string>[]) => void;
  onChangeValue: (key: string, value: string) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
  addLabel: string;
  placeholder?: string;
  firstRowNote?: string;
}) {
  return (
    <div className="space-y-2">
      <Reorder.Group axis="y" values={rows} onReorder={onReorder} className="space-y-2">
        {rows.map((row, i) => (
          <StringRow
            key={row.key}
            row={row}
            onChangeValue={onChangeValue}
            onRemove={onRemove}
            placeholder={placeholder}
            note={i === 0 ? firstRowNote : undefined}
          />
        ))}
      </Reorder.Group>
      <Button type="button" size="sm" variant="secondary" onClick={onAdd}>
        {addLabel}
      </Button>
    </div>
  );
}

function DayCard({
  row,
  index,
  onChange,
  onRemove,
  errors,
}: {
  row: Row<DayForm>;
  index: number;
  onChange: (key: string, updater: (prev: DayForm) => DayForm) => void;
  onRemove: (key: string) => void;
  errors: Record<string, string>;
}) {
  const dragControls = useDragControls();
  const set = <K extends keyof DayForm>(field: K, value: DayForm[K]) =>
    onChange(row.key, (prev) => ({ ...prev, [field]: value }));

  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={dragControls}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex items-center gap-2">
        <DragHandle dragControls={dragControls} />
        <span className="text-xs font-semibold text-slate-400">Day {index + 1}</span>
        <button
          type="button"
          onClick={() => onRemove(row.key)}
          className="ml-auto text-red-400 hover:text-red-600"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>
      <Input
        id={`day-${row.key}-title`}
        label="Title"
        value={row.value.title}
        onChange={(e) => set('title', e.target.value)}
        error={errors[`${row.key}.title`]}
      />
      <Input
        id={`day-${row.key}-theme`}
        label="Theme"
        value={row.value.theme}
        onChange={(e) => set('theme', e.target.value)}
        error={errors[`${row.key}.theme`]}
      />
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Points</label>
        <StringRowList
          rows={row.value.points}
          onReorder={(points) => set('points', points)}
          onChangeValue={(key, value) =>
            set(
              'points',
              row.value.points.map((p) => (p.key === key ? { ...p, value } : p)),
            )
          }
          onRemove={(key) =>
            set(
              'points',
              row.value.points.filter((p) => p.key !== key),
            )
          }
          onAdd={() => set('points', [...row.value.points, { key: crypto.randomUUID(), value: '' }])}
          addLabel="Add point"
        />
      </div>
      <Input
        id={`day-${row.key}-takeaway`}
        label="Takeaway"
        value={row.value.takeaway}
        onChange={(e) => set('takeaway', e.target.value)}
        error={errors[`${row.key}.takeaway`]}
      />
    </Reorder.Item>
  );
}

function TestimonialCard({
  row,
  index,
  onChange,
  onRemove,
  onResolve,
  errors,
}: {
  row: Row<TestimonialForm>;
  index: number;
  onChange: (key: string, updater: (prev: TestimonialForm) => TestimonialForm) => void;
  onRemove: (key: string) => void;
  onResolve: (key: string, url: string) => void;
  errors: Record<string, string>;
}) {
  const dragControls = useDragControls();
  const set = <K extends keyof TestimonialForm>(field: K, value: TestimonialForm[K]) =>
    onChange(row.key, (prev) => ({ ...prev, [field]: value }));

  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={dragControls}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex items-center gap-2">
        <DragHandle dragControls={dragControls} />
        <span className="text-xs font-semibold text-slate-400">Testimonial {index + 1}</span>
        <button
          type="button"
          onClick={() => onRemove(row.key)}
          className="ml-auto text-red-400 hover:text-red-600"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>
      <Input
        id={`tm-${row.key}-video`}
        label="Video URL (YouTube or Vimeo)"
        value={row.value.videoUrl}
        onChange={(e) => set('videoUrl', e.target.value)}
        onBlur={(e) => onResolve(row.key, e.target.value)}
        placeholder="https://youtu.be/... or https://vimeo.com/..."
        error={row.value.resolutionError || errors[`${row.key}.videoUrl`]}
      />
      {row.value.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.value.thumbnailUrl} alt="" className="h-24 w-auto rounded-lg border border-slate-200" />
      )}
      <Input
        id={`tm-${row.key}-name`}
        label="Name"
        value={row.value.name}
        onChange={(e) => set('name', e.target.value)}
        error={errors[`${row.key}.name`]}
      />
      <Input
        id={`tm-${row.key}-role`}
        label="Role"
        value={row.value.role}
        onChange={(e) => set('role', e.target.value)}
        error={errors[`${row.key}.role`]}
      />
      <Textarea
        id={`tm-${row.key}-quote`}
        label="Quote"
        value={row.value.quote}
        onChange={(e) => set('quote', e.target.value)}
        rows={3}
        error={errors[`${row.key}.quote`]}
      />
    </Reorder.Item>
  );
}
