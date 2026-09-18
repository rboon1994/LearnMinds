'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import { Icon } from '@/components/ui/Icon';
import { Navigation } from '@/components/layout/Navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { formatSessionDateRange } from '@/lib/eventTime';

type Speaker = { id: string; name: string; thumbnail: string | null };

type Course = {
  id: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  showTitleOnLearnPage: boolean;
  startDate: string | null;
  endDate: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  speakers: Speaker[];
  whatsappNumber: string | null;
  whatsappMessage: string | null;
  _count: { lessons: number };
  isEnrolled: boolean;
};

const GRADIENTS = [
  'from-cyan-500 to-blue-600',
  'from-yellow-500 to-orange-600',
  'from-pink-500 to-purple-600',
  'from-green-500 to-emerald-600',
];

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// ─── Course modal (locked courses) ───────────────────────────────────────────

function CourseModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const gradientIdx = course.id.charCodeAt(0) % GRADIENTS.length;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Speaker thumbnail */}
        <div className="relative aspect-video">
          {(() => {
            const src =
              course.speakers.length === 1
                ? (course.speakers[0].thumbnail ?? course.thumbnail)
                : course.thumbnail;
            return src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full bg-linear-to-br ${GRADIENTS[gradientIdx]}`} />
            );
          })()}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        {course.speakers.length > 0 && (
          <div className="flex flex-wrap gap-3 px-5 pt-4 pb-1 border-b border-slate-100">
            {course.speakers.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-semibold shrink-0">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-slate-900">{s.name}</span>
              </div>
            ))}
          </div>
        )}

        <div className="p-5 space-y-4">

          {/* Title */}
          {course.showTitleOnLearnPage && (
            <h2 className="text-lg font-bold text-slate-900 leading-snug">{course.title}</h2>
          )}

          {/* Description */}
          {course.description && (
            <p className="text-sm text-slate-600 leading-relaxed line-clamp-5">{course.description}</p>
          )}

          {/* Hidden entirely when the course has no WhatsApp number set. */}
          {course.whatsappNumber && (
            <a
              href={`https://wa.me/${course.whatsappNumber.replace(/\D/g, '')}${
                course.whatsappMessage ? `?text=${encodeURIComponent(course.whatsappMessage)}` : ''
              }`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-green-500 text-white font-semibold rounded-xl hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Contact via WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LearnPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const { user: authUser } = useAuth();
  const router = useRouter();

  const navUserName = authUser?.fullName ?? '';
  const navUser = { name: navUserName, initials: initials(navUserName), role: authUser?.role ?? '' };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${apiUrl}/courses`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setCourses)
      .catch(() => {});
  }, []);

  const speakerOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const c of courses) {
      for (const speaker of c.speakers) byId.set(speaker.id, speaker.name);
    }
    return Array.from(byId, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [courses]);

  const filteredCourses = useMemo(() => {
    let result = courses;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c.title.toLowerCase().includes(q));
    }
    if (speakerFilter) {
      result = result.filter((c) => c.speakers.some((s) => s.id === speakerFilter));
    }
    return [...result].sort((a, b) => {
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    });
  }, [courses, searchQuery, speakerFilter]);

  const enrolled = filteredCourses.filter((c) => c.isEnrolled);
  const discover = filteredCourses.filter((c) => !c.isEnrolled);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Navigation
        user={navUser}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <PageHeader
          defaultTitle="Learning Platform"
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        >
          {/* Search + filter bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex-1 min-w-0">
                <SearchInput
                  id="course-search"
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  placeholder="Search…"
                />
              </div>
              <div className="w-40 sm:w-56 shrink-0">
                <SearchableSelect
                  id="speaker-filter"
                  onChange={setSpeakerFilter}
                  options={speakerOptions}
                  placeholder="All speakers"
                  value={speakerFilter}
                />
              </div>
              <span className="shrink-0 text-xs sm:text-sm text-slate-500 whitespace-nowrap">
                <span className="font-semibold text-slate-900">{filteredCourses.length}</span>
                {' '}courses
              </span>
            </div>
          </motion.div>

          {/* Empty state */}
          {filteredCourses.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">No courses found</h3>
              <p className="text-sm text-slate-500">Try different keywords</p>
            </div>
          )}

          {/* My Courses */}
          {enrolled.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">My Courses</h2>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5"
              >
                {enrolled.map((course, idx) => (
                  <motion.article
                    key={course.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: idx * 0.04 }}
                    whileHover={{ y: -4 }}
                    onClick={() => router.push(`/learn/${course.id}`)}
                    className="group bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/50 transition-[box-shadow,border-color] cursor-pointer"
                  >
                    <div className="relative aspect-video overflow-hidden">
                      {course.status === 'DRAFT' && (
                        <span className="absolute top-2 left-2 z-10 rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-medium text-white">
                          Draft
                        </span>
                      )}
                      {course.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={course.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full bg-linear-to-br ${GRADIENTS[idx % GRADIENTS.length]}`}>
                          <div className="absolute top-3 right-3 w-20 h-20 rounded-full bg-white/15 blur-xl pointer-events-none" />
                          <div className="absolute bottom-3 left-3 w-16 h-16 rounded-full bg-black/10 blur-lg pointer-events-none" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/80 to-transparent px-3 pt-8 pb-2">
                        <div className="w-[65%]">
                          {course.showTitleOnLearnPage && (
                            <h3 className="text-2xl font-semibold text-white line-clamp-3 leading-snug">{course.title}</h3>
                          )}
                          {course.speakers.length > 0 && (
                            <p className="text-base font-medium text-white truncate mt-0.5">
                              {course.speakers.map((s) => s.name).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <span className="text-sm">{formatSessionDateRange(course.startDate, course.endDate) ?? ''}</span>
                      <span className="text-sm">{course._count.lessons} lessons</span>
                    </div>
                  </motion.article>
                ))}
              </motion.div>
            </section>
          )}

          {/* Discover New Courses */}
          {discover.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Discover New Courses</h2>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5"
              >
                {discover.map((course, idx) => (
                  <motion.article
                    key={course.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: idx * 0.04 }}
                    whileHover={{ y: -4 }}
                    onClick={() => setSelectedCourse(course)}
                    className="relative group bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/50 transition-[box-shadow,border-color] cursor-pointer"
                  >
                    <div className="relative aspect-video overflow-hidden">
                      {course.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={course.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full bg-linear-to-br ${GRADIENTS[idx % GRADIENTS.length]}`}>
                          <div className="absolute top-3 right-3 w-20 h-20 rounded-full bg-white/15 blur-xl pointer-events-none" />
                          <div className="absolute bottom-3 left-3 w-16 h-16 rounded-full bg-black/10 blur-lg pointer-events-none" />
                        </div>
                      )}
                      {/* Locked overlay — darkens on hover and shows CTA */}
                      <div className="absolute inset-0 bg-black/25 group-hover:bg-black/45 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity px-4 py-2 bg-white/90 text-slate-800 text-sm font-semibold rounded-xl shadow-lg">
                          View Details
                        </span>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/80 to-transparent px-3 pt-8 pb-2">
                        <div className="w-[65%]">
                          {course.showTitleOnLearnPage && (
                            <h3 className="text-2xl font-semibold text-white line-clamp-3 leading-snug">{course.title}</h3>
                          )}
                          {course.speakers.length > 0 && (
                            <p className="text-base font-medium text-white truncate mt-0.5">
                              {course.speakers.map((s) => s.name).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Lock badge — top-right corner */}
                      <div className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-black/50 backdrop-blur-sm">
                        <Icon name="lock" className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <span className="text-sm">{formatSessionDateRange(course.startDate, course.endDate) ?? ''}</span>
                      <span className="text-sm">{course._count.lessons} lessons</span>
                    </div>
                  </motion.article>
                ))}
              </motion.div>
            </section>
          )}
        </PageHeader>
      </div>

      {/* Course modal */}
      {selectedCourse && (
        <CourseModal course={selectedCourse} onClose={() => setSelectedCourse(null)} />
      )}
    </div>
  );
}
