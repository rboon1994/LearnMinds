'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SearchInput } from '@/components/ui/SearchInput';
import { Navigation, MAIN_NAV } from '@/components/layout/Navigation';
import { apiUrl } from '@/lib/api';

// ─── Data ────────────────────────────────────────────────────────────────────

const COURSES = [
  {
    id: 1,
    title: 'React 18 Advanced: From Hooks to Server Components',
    instructor: 'Michael Chen',
    avatar: 'MC',
    gradient: 'from-cyan-500 to-blue-600',
    duration: '12h 45m',
    lessons: 48,
  },
  {
    id: 2,
    title: 'Python Machine Learning: From Basics to Production',
    instructor: 'Sarah Wang',
    avatar: 'SW',
    gradient: 'from-yellow-500 to-orange-600',
    duration: '18h 20m',
    lessons: 62,
  },
  {
    id: 3,
    title: 'UI/UX Design Systems: Building Enterprise Design Language',
    instructor: 'Emily Zhang',
    avatar: 'EZ',
    gradient: 'from-pink-500 to-purple-600',
    duration: '9h 15m',
    lessons: 36,
  },
  {
    id: 4,
    title: 'NestJS + PostgreSQL: Full-Stack Development',
    instructor: 'David Liu',
    avatar: 'DL',
    gradient: 'from-green-500 to-emerald-600',
    duration: '15h 30m',
    lessons: 54,
  }
];

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatStudents(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const levelColors: Record<string, string> = {
  Beginner: 'bg-emerald-100 text-emerald-700',
  Intermediate: 'bg-blue-100 text-blue-700',
  Advanced: 'bg-purple-100 text-purple-700',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LearnPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNav, setActiveNav] = useState('learn');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [navUser, setNavUser] = useState({ name: '', initials: '', role: '' });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${apiUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setTenantName(data?.tenant?.name ?? null);
        const name: string = data?.fullName ?? '';
        setNavUser({ name, initials: initials(name), role: data?.role ?? '' });
      })
      .catch(() => {});
  }, []);

  const filteredCourses = useMemo(() => {
    let result = COURSES;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) => c.title.toLowerCase().includes(q) || c.instructor.toLowerCase().includes(q)
      );
    }
    return result;
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Navigation
        items={MAIN_NAV}
        activeId={activeNav}
        onNavigate={setActiveNav}
        user={navUser}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* ── Main ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 px-4 sm:px-6 lg:px-6 py-6 overflow-x-hidden">
          <div className="max-w-7xl mx-auto space-y-8">

            {/* ── Hero banner ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="pb-6 sm:pb-8 mb-0"
            >
              {/* Ambient blobs — signature depth element */}
              
              <div className="relative flex flex-col lg:flex-row gap-8 items-start lg:items-center justify-between">
                {/* Left */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setMobileMenuOpen(true)}
                    className="lg:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                    aria-label="Open menu"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                    {tenantName ?? 'LearnMinds'}
                  </h1>
                </div>
              </div>
            </motion.div>

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
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5"
              >
                  {filteredCourses.map((course, idx) => (
                    <motion.article
                      key={course.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: idx * 0.04 }}
                      whileHover={{ y: -4 }}
                      className="group bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/50 transition-all cursor-pointer"
                    >
                      {/* Cover */}
                      <div className={`relative aspect-video bg-gradient-to-br ${course.gradient} overflow-hidden`}>
                        {/* Decorative blobs */}
                        <div className="absolute top-3 right-3 w-20 h-20 rounded-full bg-white/15 blur-xl pointer-events-none" />
                        <div className="absolute bottom-3 left-3 w-16 h-16 rounded-full bg-black/10 blur-lg pointer-events-none" />
                        {/* Initial watermark */}
                        <div className="absolute inset-0 flex items-center justify-center text-white/15 text-7xl font-black select-none">
                          {course.title.charAt(0)}
                        </div>

                        {/* Duration */}
                        <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 bg-black/55 backdrop-blur-sm text-white text-xs rounded-md font-medium">
                          {course.duration}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-4">
                        <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 mb-3 group-hover:text-indigo-600 transition-colors leading-snug min-h-[2.5rem]">
                          {course.title}
                        </h3>

                        {/* Lecturer + lesson */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                              {course.avatar}
                            </div>
                            <span className="text-xs text-slate-500 truncate max-w-[100px]">{course.instructor}</span>
                          </div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-slate-400">{course.lessons} lessons</span>
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </motion.div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
