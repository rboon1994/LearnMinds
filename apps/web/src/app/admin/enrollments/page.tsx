'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteDialog, Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

type Enrollment = {
  id: string;
  expiresAt: string | null;
  student: { user: { fullName: string; email: string } | null } | null;
  tenant: { id: string; name: string } | null;
  series: { id: string; name: string };
};

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function validateEnrollmentForm(assignId: string, assignSeriesId: string) {
  if (!assignId) return { error: 'Please select a student or tenant', field: 'assignId' };
  if (!assignSeriesId) return { error: 'Please select a course series', field: 'assignSeriesId' };
  return null;
}

export default function AdminEnrollmentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [students, setStudents] = useState<{ value: string; label: string }[]>([]);
  const [tenants, setTenants] = useState<{ value: string; label: string }[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<{ value: string; label: string }[]>([]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [assignType, setAssignType] = useState<'STUDENT' | 'TENANT'>('STUDENT');
  const [assignId, setAssignId] = useState('');
  const [assignSeriesId, setAssignSeriesId] = useState('');
  const [assignExpiresAt, setAssignExpiresAt] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingEnrollment, setEditingEnrollment] = useState<Enrollment | null>(null);
  const [editSeriesId, setEditSeriesId] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadEnrollments = () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    fetch(`${apiUrl}/enrollments?${params.toString()}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: Enrollment[]; total: number }) => {
        setEnrollments(res.data);
        setTotal(res.total);
      })
      .catch(() => {});
  };

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/admin');
      return;
    }
    if (!user) return;
    loadEnrollments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router, page, debouncedSearch]);

  useEffect(() => {
    if (!user || user.role !== 'SUPER_ADMIN') return;
    fetch(`${apiUrl}/students?pageSize=100000`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: { studentId: string; fullName: string; email: string }[] }) =>
        setStudents(res.data.map((s) => ({ value: s.studentId, label: `${s.fullName} (${s.email})` }))),
      )
      .catch(() => {});
    fetch(`${apiUrl}/tenants`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) =>
        setTenants(data.map((t) => ({ value: t.id, label: t.name }))),
      )
      .catch(() => {});
    fetch(`${apiUrl}/course-series`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) =>
        setSeriesOptions(data.map((s) => ({ value: s.id, label: s.name }))),
      )
      .catch(() => {});
  }, [user]);

  const columns: AdminTableColumn<Enrollment>[] = [
    {
      header: 'Student / Tenant',
      render: (enrollment) => (
        <span className="font-medium text-slate-900">
          {enrollment.student
            ? (enrollment.student.user?.fullName ?? enrollment.student.user?.email)
            : enrollment.tenant?.name}
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-normal ${
              enrollment.student ? 'bg-teal-50 text-teal-700' : 'bg-blue-50 text-blue-700'
            }`}
          >
            {enrollment.student ? 'Student' : 'Tenant'}
          </span>
        </span>
      ),
    },
    { header: 'Course Series', render: (enrollment) => enrollment.series.name },
    {
      header: 'Expires At',
      render: (enrollment) => (enrollment.expiresAt ? new Date(enrollment.expiresAt).toLocaleDateString() : '—'),
    },
  ];

  if (user && user.role !== 'SUPER_ADMIN') return null;

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setAssignType('STUDENT');
    setAssignId('');
    setAssignSeriesId('');
    setAssignExpiresAt('');
    setCreateError('');
  };

  const createEnrollment = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const validation = validateEnrollmentForm(assignId, assignSeriesId);
    if (validation) {
      setCreateError(validation.error);
      return;
    }
    setIsCreating(true);
    setCreateError('');
    const res = await fetch(`${apiUrl}/enrollments`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: assignType === 'STUDENT' ? assignId : undefined,
        tenantId: assignType === 'TENANT' ? assignId : undefined,
        seriesId: assignSeriesId,
        expiresAt: assignExpiresAt || undefined,
      }),
    });
    setIsCreating(false);
    if (!res.ok) {
      setCreateError(res.status === 409 ? 'Already enrolled in this series' : 'Failed to create enrollment');
      return;
    }
    toast.saved();
    closeCreateDialog();
    loadEnrollments();
  };

  const openEditDialog = (enrollment: Enrollment) => {
    setEditingEnrollment(enrollment);
    setEditSeriesId(enrollment.series.id);
    setEditExpiresAt(enrollment.expiresAt ? enrollment.expiresAt.slice(0, 10) : '');
    setEditError('');
  };

  const closeEditDialog = () => {
    setEditingEnrollment(null);
    setConfirmDelete(false);
  };

  const saveEnrollment = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!editingEnrollment) return;
    if (!editSeriesId) {
      setEditError('Please select a course series');
      return;
    }
    setIsSaving(true);
    setEditError('');
    const res = await fetch(`${apiUrl}/enrollments/${editingEnrollment.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesId: editSeriesId,
        expiresAt: editExpiresAt || undefined,
      }),
    });
    setIsSaving(false);
    if (!res.ok) {
      setEditError(res.status === 409 ? 'Already enrolled in this series' : 'Failed to save enrollment');
      return;
    }
    toast.saved();
    closeEditDialog();
    loadEnrollments();
  };

  const deleteEnrollment = async () => {
    if (!editingEnrollment) return;
    const res = await fetch(`${apiUrl}/enrollments/${editingEnrollment.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
    closeEditDialog();
    loadEnrollments();
  };

  return (
    <AdminLayout
      title="Enrollments"
      backHref="/admin"
      actions={
        <Button
          leftIcon={<Icon name="plus" className="mr-1.5 h-4 w-4" />}
          onClick={() => setIsCreateOpen(true)}
          variant="gradient"
        >
          New Enrollment
        </Button>
      }
    >
      <AdminTable
        columns={columns}
        data={enrollments}
        keyField="id"
        onRowClick={openEditDialog}
        emptyMessage={total === 0 && !debouncedSearch ? 'No enrollments yet.' : 'No enrollments match your search.'}
        pagination={{ page, pageSize, total, onPageChange: setPage }}
        toolbar={
          <div className="flex-1 min-w-50">
            <Input
              id="searchEnrollments"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by student, tenant, or course series..."
              value={search}
            />
          </div>
        }
      />

      <Dialog isOpen={isCreateOpen} onClose={closeCreateDialog} title="New Enrollment">
        <form className="space-y-5" onSubmit={createEnrollment} noValidate>
          <RadioGroup
            label="Assign to"
            name="assignType"
            onChange={(value) => {
              setAssignType(value as 'STUDENT' | 'TENANT');
              setAssignId('');
            }}
            options={[
              { label: 'Student', value: 'STUDENT' },
              { label: 'Tenant', value: 'TENANT' },
            ]}
            value={assignType}
          />
          <SearchableSelect
            id="assignId"
            label={assignType === 'STUDENT' ? 'Student' : 'Tenant'}
            onChange={setAssignId}
            options={assignType === 'STUDENT' ? students : tenants}
            required
            value={assignId}
          />
          <SearchableSelect
            id="assignSeriesId"
            label="Course Series"
            onChange={setAssignSeriesId}
            options={seriesOptions}
            required
            value={assignSeriesId}
          />
          <Input
            id="assignExpiresAt"
            label="Expires At"
            type="date"
            value={assignExpiresAt}
            onChange={(e) => setAssignExpiresAt(e.target.value)}
          />
          {createError && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {createError}
            </Alert>
          )}
          <Button type="submit" isLoading={isCreating} loadingLabel="Creating...">
            Create Enrollment
          </Button>
        </form>
      </Dialog>

      <Dialog isOpen={editingEnrollment !== null} onClose={closeEditDialog} title="Edit Enrollment">
        <form className="space-y-5" onSubmit={saveEnrollment} noValidate>
          <Input
            id="editAssignee"
            label={editingEnrollment?.student ? 'Student' : 'Tenant'}
            disabled
            value={
              editingEnrollment?.student
                ? (editingEnrollment.student.user?.fullName ?? editingEnrollment.student.user?.email ?? '')
                : (editingEnrollment?.tenant?.name ?? '')
            }
          />
          <SearchableSelect
            id="editSeriesId"
            label="Course Series"
            onChange={setEditSeriesId}
            options={seriesOptions}
            required
            value={editSeriesId}
          />
          <Input
            id="editExpiresAt"
            label="Expires At (optional)"
            type="date"
            value={editExpiresAt}
            onChange={(e) => setEditExpiresAt(e.target.value)}
          />
          {editError && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {editError}
            </Alert>
          )}
          <div className="flex gap-3">
            <Button type="submit" isLoading={isSaving} loadingLabel="Saving...">
              Save
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              leftIcon={<Icon name="trash" className="h-4 w-4 mr-1.5" />}
            >
              Delete
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDeleteDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteEnrollment}
        title="Delete Enrollment"
        userEmail={user?.email ?? ''}
      />
    </AdminLayout>
  );
}
