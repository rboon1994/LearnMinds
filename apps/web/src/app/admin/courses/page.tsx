'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FeatureGate } from '@/components/ui/FeatureGate';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { formatDateRange } from '@/lib/duration';

type Course = {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED';
  startDate: string | null;
  endDate: string | null;
  _count: { lessons: number; files: number };
  tenant?: { id: string; name: string } | null;
  series: { id: string; name: string } | null;
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

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
];

export default function AdminCoursesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const handleDuplicateOrSaveError = (res: Response) => {
    if (res.status === 409) toast.duplicateName();
    else toast.saveFailed();
  };
  const [courses, setCourses] = useState<Course[]>([]);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [isSeriesOpen, setIsSeriesOpen] = useState(false);
  const [series, setSeries] = useState<CourseSeries[]>([]);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [editingSeriesName, setEditingSeriesName] = useState('');

  const [speakerOptions, setSpeakerOptions] = useState<{ value: string; label: string }[]>([]);

  const [searchTitle, setSearchTitle] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [seriesFilterId, setSeriesFilterId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createThumbnail, setCreateThumbnail] = useState('');
  const [createStartDate, setCreateStartDate] = useState('');
  const [createEndDate, setCreateEndDate] = useState('');
  const [createSeriesId, setCreateSeriesId] = useState('');
  const [createSpeakerIds, setCreateSpeakerIds] = useState<string[]>([]);
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Debounce the title search so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchTitle.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchTitle]);

  useEffect(() => {
    if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      router.replace('/admin');
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) return;
    const path = isSuperAdmin ? '/courses/admin/all' : '/courses/admin';
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (seriesFilterId) params.set('seriesId', seriesFilterId);
    if (statusFilter) params.set('status', statusFilter);
    fetch(`${apiUrl}${path}?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((res: { data: Course[]; total: number }) => {
        setCourses(res.data);
        setTotal(res.total);
      })
      .catch(() => {});
  }, [user, isSuperAdmin, router, page, debouncedSearch, seriesFilterId, statusFilter]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch(`${apiUrl}/course-series`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setSeries)
      .catch(() => {});
    fetch(`${apiUrl}/speakers?pageSize=1000`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: { id: string; name: string }[] }) =>
        setSpeakerOptions(res.data.map((s) => ({ value: s.id, label: s.name }))),
      )
      .catch(() => {});
  }, [isSuperAdmin]);

  const seriesOptions = useMemo(
    () => series.map((s) => ({ value: s.id, label: s.name })),
    [series],
  );

  const columns: AdminTableColumn<Course>[] = [
    { header: 'Title', render: (course) => course.title },
    { header: 'Tenant', hidden: !isSuperAdmin, render: (course) => course.tenant?.name ?? 'Global' },
    { header: 'Status', render: (course) => <StatusBadge status={course.status} /> },
    { header: 'Date', render: (course) => formatDateRange(course.startDate, course.endDate) ?? '—' },
    { header: 'Series', render: (course) => course.series?.name ?? '—' },
    { header: 'Lessons', render: (course) => course._count.lessons },
    { header: 'Files', render: (course) => course._count.files },
  ];

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
      handleDuplicateOrSaveError(res);
      return;
    }
    toast.saved();
    setNewSeriesName('');
    loadSeries();
  };

  const openCreateDialog = () => setIsCreateOpen(true);

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateTitle('');
    setCreateDescription('');
    setCreateThumbnail('');
    setCreateStartDate('');
    setCreateEndDate('');
    setCreateSeriesId('');
    setCreateSpeakerIds([]);
    setCreateError('');
  };

  const createCourse = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!createTitle.trim()) {
      setCreateError('Title is required');
      setTimeout(() => document.getElementById('createTitle')?.focus(), 0);
      return;
    }
    setIsCreating(true);
    setCreateError('');
    const res = await fetch(`${apiUrl}/courses`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: createTitle,
        description: createDescription || undefined,
        thumbnail: createThumbnail || undefined,
        startDate: createStartDate || undefined,
        endDate: createEndDate || undefined,
        seriesId: createSeriesId || undefined,
        speakerIds: createSpeakerIds,
      }),
    });
    setIsCreating(false);
    if (!res.ok) {
      setCreateError('Failed to create course');
      return;
    }
    const course = await res.json();
    router.push(`/admin/courses/${course.id}`);
  };

  const saveSeriesRename = async (id: string) => {
    if (!editingSeriesName.trim()) return;
    const res = await fetch(`${apiUrl}/course-series/${id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingSeriesName }),
    });
    if (!res.ok) {
      handleDuplicateOrSaveError(res);
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
          <Button onClick={openCreateDialog} variant="gradient">
            New Course
          </Button>
        </>
      }
    >
      <FeatureGate featureKey="course-management">
        <AdminTable
          columns={columns}
          data={courses}
          keyField="id"
          onRowClick={(course) => router.push(`/admin/courses/${course.id}`)}
          emptyMessage={
            total === 0 && !debouncedSearch && !seriesFilterId && !statusFilter
              ? 'No courses yet.'
              : 'No courses match your filters.'
          }
          pagination={{ page, pageSize, total, onPageChange: setPage }}
          toolbar={
            <>
              <div className="flex-1 min-w-50">
                <Input
                  id="searchTitle"
                  onChange={(e) => {
                    setSearchTitle(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by title..."
                  value={searchTitle}
                />
              </div>
              {isSuperAdmin && (
                <div className="w-full sm:w-64">
                  <SearchableSelect
                    id="seriesFilter"
                    onChange={(value) => {
                      setSeriesFilterId(value);
                      setPage(1);
                    }}
                    options={seriesOptions}
                    placeholder="All series"
                    value={seriesFilterId}
                  />
                </div>
              )}
              <div className="w-full sm:w-48">
                <SearchableSelect
                  id="statusFilter"
                  onChange={(value) => {
                    setStatusFilter(value);
                    setPage(1);
                  }}
                  options={STATUS_OPTIONS}
                  placeholder="All statuses"
                  value={statusFilter}
                />
              </div>
            </>
          }
        />
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
                autoFocus
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

      <Dialog isOpen={isCreateOpen} onClose={closeCreateDialog} title="New Course">
        <form className="space-y-5" onSubmit={createCourse} noValidate>
          <Input
            autoFocus
            id="createTitle"
            label="Title"
            onChange={(e) => setCreateTitle(e.target.value)}
            required
            value={createTitle}
          />
          <Textarea
            id="createDescription"
            label="Description"
            onChange={(e) => setCreateDescription(e.target.value)}
            rows={4}
            value={createDescription}
          />
          <Input
            id="createThumbnail"
            label="Thumbnail"
            onChange={(e) => setCreateThumbnail(e.target.value)}
            placeholder="https://..."
            value={createThumbnail}
          />
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <Input
                id="createStartDate"
                label="Start date"
                onChange={(e) => setCreateStartDate(e.target.value)}
                type="date"
                value={createStartDate}
              />
            </div>
            <div className="flex-1 min-w-0">
              <Input
                id="createEndDate"
                label="End date"
                onChange={(e) => setCreateEndDate(e.target.value)}
                type="date"
                value={createEndDate}
              />
            </div>
          </div>
          {isSuperAdmin && (
            <SearchableSelect
              id="createSeriesId"
              label="Course Series"
              onChange={setCreateSeriesId}
              options={seriesOptions}
              placeholder="No series"
              value={createSeriesId}
            />
          )}
          {isSuperAdmin && (
            <SearchableSelect
              id="createSpeakerIds"
              label="Speaker"
              multiple
              onChange={setCreateSpeakerIds}
              options={speakerOptions}
              placeholder="No speaker"
              value={createSpeakerIds}
            />
          )}
          {createError && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {createError}
            </Alert>
          )}
          <Button type="submit" isLoading={isCreating} loadingLabel="Creating...">
            Create Course
          </Button>
        </form>
      </Dialog>
    </AdminLayout>
  );
}
