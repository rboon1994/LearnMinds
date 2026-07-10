'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { SearchInput } from '@/components/ui/SearchInput';
import { Navigation } from '@/components/layout/Navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { formatDateRange } from '@/lib/duration';

type Course = {
  id: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  startDate: string | null;
  endDate: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  _count: { lessons: number };
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

export default function LearnPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
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

  const filteredCourses = useMemo(() => {
    let result = courses;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c.title.toLowerCase().includes(q));
    }
    return result;
  }, [courses, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Navigation
        user={navUser}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* ── Main ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <PageHeader
          defaultTitle="Super Admin Panel"
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        >
            {/* ── Search bar ── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="space-y-3"
            >
              {/* Controls row */}
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Search */}
                <div className="flex-1 min-w-0">
                  <SearchInput
                    id="course-search"
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    placeholder="Search…"
                  />
                </div>

                {/* Count */}
                <span className="shrink-0 text-xs sm:text-sm text-slate-500 whitespace-nowrap">
                  <span className="font-semibold text-slate-900">{filteredCourses.length}</span>
                  {' '}courses
                </span>
              </div>
            </motion.div>

            {/* ── Courses ── */}
            {filteredCourses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                  <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">No courses found</h3>
                <p className="text-sm text-slate-500">Try different keywords</p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-5"
              >
                  {filteredCourses.map((course, idx) => (
                    <motion.article
                      key={course.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: idx * 0.04 }}
                      whileHover={{ y: -4 }}
                      onClick={() => router.push(`/learn/${course.id}`)}
                      className="group bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/50 transition-all cursor-pointer"
                    >
                      {/* Cover */}
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
                          <div className={`w-full h-full bg-gradient-to-br ${GRADIENTS[idx % GRADIENTS.length]}`}>
                            <div className="absolute top-3 right-3 w-20 h-20 rounded-full bg-white/15 blur-xl pointer-events-none" />
                            <div className="absolute bottom-3 left-3 w-16 h-16 rounded-full bg-black/10 blur-lg pointer-events-none" />
                            <div className="absolute inset-0 flex items-center justify-center text-white/15 text-7xl font-black select-none">
                              {course.title.charAt(0)}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-4">
                        <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 mb-1 group-hover:text-indigo-600 transition-colors leading-snug min-h-[2.5rem]">
                          {course.title}
                        </h3>
                        {formatDateRange(course.startDate, course.endDate) && (
                          <p className="text-xs text-slate-400 mb-2">
                            {formatDateRange(course.startDate, course.endDate)}
                          </p>
                        )}
                        <span className="text-xs text-slate-400">{course._count.lessons} lessons</span>
                      </div>
                    </motion.article>
                  ))}
                </motion.div>
            )}
        </PageHeader>
      </div>
    </div>
  );
}
