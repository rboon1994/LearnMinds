'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Navigation } from '@/components/layout/Navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { VideoPlayer } from '@/components/ui/VideoPlayer';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { formatDateRange, formatDuration } from '@/lib/duration';

type Lesson = {
  id: string;
  title: string;
  videoType: 'UPLOAD' | 'EXTERNAL_LINK';
  videoUrl: string | null;
  durationSeconds: number | null;
};

type CourseFile = {
  id: string;
  fileName: string;
};

type Course = {
  id: string;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  speakers: { id: string; name: string }[];
  lessons: Lesson[];
  files: CourseFile[];
};

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// Downloads are fetched as blobs (not a plain <a href>) so the Authorization header the
// rest of this app relies on everywhere can actually be attached to the request.
async function downloadBlob(url: string, fileName: string) {
  const res = await fetch(url, { headers: authHeaders() });
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export default function CourseDetailPage() {
  const { user } = useAuth();
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<{ url: string; type: string } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/courses/${params.courseId}`, { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) { router.replace('/learn'); return null; }
        return r.json();
      })
      .then((data: Course | null) => {
        if (!data) return;
        setCourse(data);
        setActiveLessonId(data.lessons[0]?.id ?? null);
      })
      .catch(() => {});
  }, [params.courseId, router]);

  const activeLesson = course?.lessons.find((l) => l.id === activeLessonId) ?? null;
  const activeLessonIndex = course?.lessons.findIndex((l) => l.id === activeLessonId) ?? -1;

  // Same rationale as file downloads: <video src> can't attach an Authorization header,
  // so the upload stream is fetched as a blob and played from an object URL instead.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before fetching the newly active lesson's video
    setVideoSrc(null);
    if (!activeLesson || activeLesson.videoType !== 'UPLOAD') return;
    let objectUrl: string | null = null;
    fetch(`${apiUrl}/courses/${params.courseId}/lessons/${activeLesson.id}/video`, { headers: authHeaders() })
      .then((r) => r.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        // blob.type comes from the response's Content-Type header — pass the real type
        // through instead of assuming mp4, since mobile Safari rejects a mismatched one.
        setVideoSrc({ url: objectUrl, type: blob.type });
      })
      .catch(() => {});
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeLesson, params.courseId]);

  const navUserName = user?.fullName ?? '';
  const navUser = { name: navUserName, initials: initials(navUserName), role: user?.role ?? '' };

  if (!course) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Navigation user={navUser} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <PageHeader defaultTitle={course.title} backHref="/learn" onOpenMobileMenu={() => setMobileMenuOpen(true)}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            {/* Source order is Video, then a Lessons+Files wrapper, so mobile (single-column)
                stacks Video/Lessons/Files in that order. On lg: this becomes the left column;
                Lessons+Files are wrapped in their own flex column (not grid row-placement) so
                their spacing doesn't depend on the video block's height — grid row placement
                stretches a row to the tallest item across columns, which left a gap between
                Lessons and Files when the video column was taller than the lessons list. */}
            <div>
              {/* No overflow-hidden here: combined with rounded-xl it clips this box via a
                  compositing layer, and WebKit (Safari + every iOS browser, since Apple forces
                  them all onto WebKit) mis-resolves touch hit-testing for the Video.js control
                  bar against the video's own separately-composited decode layer underneath it —
                  taps land on nothing. Confirmed by removing it on-device. Trade-off: the video
                  now renders with square corners instead of matching the rounded-xl container. */}
              <div className="relative aspect-15/9 lg:aspect-video bg-black rounded-xl mb-4">
                {activeLesson?.videoType === 'UPLOAD' && videoSrc && (
                  <VideoPlayer src={videoSrc.url} type={videoSrc.type || undefined} />
                )}
                {activeLesson?.videoType === 'EXTERNAL_LINK' && activeLesson.videoUrl && (
                  // ponytail: plays inline via iframe (no new window) rather than routing through
                  // Video.js, which only plays direct video files, not third-party watch pages.
                  // Assumes the pasted link is already embed-friendly (e.g. player.vimeo.com/video/…);
                  // add per-provider URL rewriting later if editors paste plain watch-page links.
                  // rounded-xl + overflow-hidden go on the iframe itself, not the shared ancestor
                  // above (that div must stay overflow-visible for the Video.js touch fix) — an
                  // iframe is a single opaque element/compositing boundary to the parent page, so
                  // clipping it here can't cause the two-separately-composited-layers hit-testing
                  // bug that overflow-hidden causes for Video.js's <video> + control bar pair.
                  <iframe
                    src={activeLesson.videoUrl}
                    className="absolute inset-0 w-full h-full rounded-xl overflow-hidden"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                )}
                {!activeLesson && (
                  <p className="absolute inset-0 flex items-center justify-center text-white/60">No lessons yet.</p>
                )}
              </div>
              {activeLesson && <h2 className="text-lg font-semibold text-slate-900 mb-1">{activeLesson.title}</h2>}
              {course.speakers.length > 0 && (
                <p className="text-sm font-medium text-slate-700 mb-1">
                  {course.speakers.map((s) => s.name).join(', ')}
                </p>
              )}
              {formatDateRange(course.startDate, course.endDate) && (
                <p className="text-xs text-slate-400 mb-1">{formatDateRange(course.startDate, course.endDate)}</p>
              )}
              {course.description && <p className="text-sm text-slate-500">{course.description}</p>}
            </div>

            <div className="flex flex-col gap-6 h-fit">
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">
                  Lessons{' '}
                  <span className="text-sm font-normal text-slate-400">
                    ( {activeLessonIndex >= 0 ? activeLessonIndex + 1 : 0} / {course.lessons.length} )
                  </span>
                </h3>
                <div className="rounded-xl border border-slate-200 bg-white p-2 max-h-80 overflow-y-auto">
                  {course.lessons.map((lesson, idx) => (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => setActiveLessonId(lesson.id)}
                      className={`w-full flex items-center gap-3 p-3 text-left rounded-xl border-l-2 ${
                        lesson.id === activeLessonId
                          ? 'bg-teal-50 border-teal-400'
                          : 'border-transparent hover:bg-slate-50'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-medium ${
                          lesson.id === activeLessonId ? 'bg-teal-400 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {lesson.id === activeLessonId ? <Icon name="play" className="h-3.5 w-3.5" /> : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm truncate ${
                            lesson.id === activeLessonId ? 'text-teal-600 font-medium' : 'text-slate-900'
                          }`}
                        >
                          {lesson.title}
                        </p>
                        <p className="text-xs text-slate-400">{formatDuration(lesson.durationSeconds) ?? '--:--'}</p>
                      </div>
                    </button>
                  ))}
                  {course.lessons.length === 0 && (
                    <p className="p-6 text-center text-slate-400 text-sm">No lessons yet.</p>
                  )}
                </div>
              </div>

              {course.files.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">
                    Files <span className="text-sm font-normal text-slate-400">( {course.files.length} )</span>
                  </h3>
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-62 overflow-y-auto">
                    {course.files.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() =>
                          downloadBlob(`${apiUrl}/courses/${course.id}/files/${file.id}/download`, file.fileName)
                        }
                        className="w-full flex items-center px-4 py-3 text-left hover:bg-slate-50"
                      >
                        <Icon name="file" className="h-4 w-4 mr-3 text-slate-400" />
                        <span className="flex-1 truncate text-slate-900">{file.fileName}</span>
                        <Icon name="download" className="h-4 w-4 text-slate-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </PageHeader>
      </div>
    </div>
  );
}
