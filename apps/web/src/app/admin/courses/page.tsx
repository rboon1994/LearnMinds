'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { FeatureGate } from '@/components/ui/FeatureGate';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

type Course = {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED';
  _count: { lessons: number };
  tenant?: { id: string; name: string } | null;
};

export default function AdminCoursesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      router.replace('/admin');
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) return;
    const path = isSuperAdmin ? '/courses/admin/all' : '/courses/admin';
    fetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setCourses)
      .catch(() => {});
  }, [user, isSuperAdmin, router]);

  if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return null;

  return (
    <AdminLayout title="Courses" actions={<Button href="/admin/courses/new">New Course</Button>}>
      <FeatureGate featureKey="course-management">
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Title</th>
                {isSuperAdmin && <th className="px-4 py-3 text-left">Tenant</th>}
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Lessons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {courses.map((course) => (
                <tr
                  key={course.id}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => router.push(`/admin/courses/${course.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{course.title}</td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3 text-slate-500">{course.tenant?.name ?? 'Global'}</td>
                  )}
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        course.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {course.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{course._count.lessons}</td>
                </tr>
              ))}
              {courses.length === 0 && (
                <tr>
                  <td colSpan={isSuperAdmin ? 4 : 3} className="px-4 py-8 text-center text-slate-400">
                    No courses yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </FeatureGate>
    </AdminLayout>
  );
}
