'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FeatureGate } from '@/components/ui/FeatureGate';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

type Course = {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED';
  _count: { lessons: number };
  tenant?: { id: string; name: string } | null;
};

type CourseSeries = {
  id: string;
  name: string;
  _count: { courses: number };
};

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export default function AdminCoursesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [isSeriesOpen, setIsSeriesOpen] = useState(false);
  const [series, setSeries] = useState<CourseSeries[]>([]);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [editingSeriesName, setEditingSeriesName] = useState('');

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

  const loadSeries = () => {
    fetch(`${apiUrl}/course-series`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setSeries)
      .catch(() => {});
  };

  const openSeriesDialog = () => {
    setIsSeriesOpen(true);
    loadSeries();
  };

  const closeSeriesDialog = () => {
    setIsSeriesOpen(false);
    setNewSeriesName('');
    setEditingSeriesId(null);
    setEditingSeriesName('');
  };

  const createSeries = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!newSeriesName.trim()) return;
    const res = await fetch(`${apiUrl}/course-series`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSeriesName }),
    });
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.saved();
    setNewSeriesName('');
    loadSeries();
  };

  const saveSeriesRename = async (id: string) => {
    if (!editingSeriesName.trim()) return;
    const res = await fetch(`${apiUrl}/course-series/${id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingSeriesName }),
    });
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.saved();
    setEditingSeriesId(null);
    loadSeries();
  };

  const deleteSeries = async (seriesItem: CourseSeries) => {
    if (!confirm(`Delete series "${seriesItem.name}"?`)) return;
    const res = await fetch(`${apiUrl}/course-series/${seriesItem.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.deleteFailed();
      if (data?.message) alert(data.message);
      return;
    }
    toast.deleted();
    loadSeries();
  };

  return (
    <AdminLayout
      title="Courses"
      backHref="/admin"
      actions={
        <>
          {isSuperAdmin && (
            <Button variant="secondary" onClick={openSeriesDialog}>
              Manage Series
            </Button>
          )}
          <Button href="/admin/courses/new" variant="gradient">
            New Course
          </Button>
        </>
      }
    >
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
                    <StatusBadge status={course.status} />
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

      <Dialog isOpen={isSeriesOpen} onClose={closeSeriesDialog} title="Course Series">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {series.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-4 py-3">
                {editingSeriesId === item.id ? (
                  <>
                    <input
                      autoFocus
                      className="flex-1 min-w-0 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                      value={editingSeriesName}
                      onChange={(e) => setEditingSeriesName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="text-teal-600 hover:text-teal-800"
                      onClick={() => saveSeriesRename(item.id)}
                    >
                      <Icon name="check" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-700"
                      onClick={() => setEditingSeriesId(null)}
                    >
                      <Icon name="x" className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-400">{item._count.courses} course(s)</p>
                    </div>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-700"
                      onClick={() => {
                        setEditingSeriesId(item.id);
                        setEditingSeriesName(item.name);
                      }}
                    >
                      <Icon name="edit" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => deleteSeries(item)}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
            {series.length === 0 && <p className="px-4 py-6 text-center text-slate-400">No series yet.</p>}
          </div>
          <form className="flex items-end gap-2" onSubmit={createSeries}>
            <div className="flex-1 min-w-0">
              <Input
                id="newSeriesName"
                label="New series name"
                value={newSeriesName}
                onChange={(e) => setNewSeriesName(e.target.value)}
              />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </div>
      </Dialog>
    </AdminLayout>
  );
}
