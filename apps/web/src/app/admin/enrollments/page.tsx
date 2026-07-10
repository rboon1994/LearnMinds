'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
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

export default function AdminEnrollmentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<{ value: string; label: string }[]>([]);
  const [tenants, setTenants] = useState<{ value: string; label: string }[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<{ value: string; label: string }[]>([]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [assignType, setAssignType] = useState<'STUDENT' | 'TENANT'>('STUDENT');
  const [assignId, setAssignId] = useState('');
  const [assignSeriesId, setAssignSeriesId] = useState('');
  const [assignExpiresAt, setAssignExpiresAt] = useState('');

  const loadEnrollments = () => {
    fetch(`${apiUrl}/enrollments`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setEnrollments)
      .catch(() => {});
  };

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/admin');
      return;
    }
    if (!user) return;
    loadEnrollments();
    fetch(`${apiUrl}/students`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: { id: string; fullName: string; email: string }[]) =>
        setStudents(data.map((s) => ({ value: s.id, label: `${s.fullName} (${s.email})` }))),
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
  }, [user, router]);

  if (user && user.role !== 'SUPER_ADMIN') return null;

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setAssignType('STUDENT');
    setAssignId('');
    setAssignSeriesId('');
    setAssignExpiresAt('');
  };

  const createEnrollment = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!assignId || !assignSeriesId) return;
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
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.saved();
    closeCreateDialog();
    loadEnrollments();
  };

  const revokeEnrollment = async (id: string) => {
    if (!confirm('Revoke this enrollment?')) return;
    const res = await fetch(`${apiUrl}/enrollments/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
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
          variant="secondary"
        >
          Create New Enrollment
        </Button>
      }
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Student / Tenant</th>
              <th className="px-4 py-3 text-left">Course Series</th>
              <th className="px-4 py-3 text-left">Expires At</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {enrollments.map((enrollment) => (
              <tr key={enrollment.id}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {enrollment.student
                    ? (enrollment.student.user?.fullName ?? enrollment.student.user?.email)
                    : enrollment.tenant?.name}
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                    {enrollment.student ? 'Student' : 'Tenant'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{enrollment.series.name}</td>
                <td className="px-4 py-3 text-slate-500">
                  {enrollment.expiresAt ? new Date(enrollment.expiresAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="text-red-500 hover:text-red-700"
                    onClick={() => revokeEnrollment(enrollment.id)}
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No enrollments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog isOpen={isCreateOpen} onClose={closeCreateDialog} title="Create New Enrollment">
        <form className="space-y-4" onSubmit={createEnrollment}>
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
            value={assignId}
          />
          <SearchableSelect
            id="assignSeriesId"
            label="Course Series"
            onChange={setAssignSeriesId}
            options={seriesOptions}
            value={assignSeriesId}
          />
          <Input
            id="assignExpiresAt"
            label="Expires At (optional)"
            type="date"
            value={assignExpiresAt}
            onChange={(e) => setAssignExpiresAt(e.target.value)}
          />
          <Button type="submit">Create Enrollment</Button>
        </form>
      </Dialog>
    </AdminLayout>
  );
}
