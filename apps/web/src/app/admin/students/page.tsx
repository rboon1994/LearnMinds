'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

type Student = {
  id: string;
  email: string;
  fullName: string;
  phoneCountryCode: string | null;
  phoneNo: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  lastSignInAt: string | null;
};

type StudentRow = { fullName: string; email: string; phoneNo: string };

type BulkResult = { email: string; status: 'created' | 'skipped'; reason?: string };

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function emptyRow(): StudentRow {
  return { fullName: '', email: '', phoneNo: '' };
}

export default function AdminStudentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [rows, setRows] = useState<StudentRow[]>([emptyRow()]);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    fetch(`${apiUrl}/students`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setStudents)
      .catch(() => {});
  };

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/admin');
      return;
    }
    if (!user) return;
    load();
  }, [user, router]);

  if (user && user.role !== 'SUPER_ADMIN') return null;

  const closeBulkDialog = () => {
    setIsBulkOpen(false);
    setRows([emptyRow()]);
    setResults(null);
  };

  const updateRow = (index: number, field: keyof StudentRow, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const submitBulkRegister = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const validRows = rows.filter((row) => row.fullName.trim() && row.email.trim());
    if (validRows.length === 0) return;
    setSubmitting(true);
    const res = await fetch(`${apiUrl}/students/bulk`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ students: validRows }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    const data: BulkResult[] = await res.json();
    setResults(data);
    toast.saved();
    load();
  };

  return (
    <AdminLayout
      title="Students"
      backHref="/admin"
      actions={
        <Button
          leftIcon={<Icon name="plus" className="mr-1.5 h-4 w-4" />}
          onClick={() => setIsBulkOpen(true)}
          variant="secondary"
        >
          Bulk Register
        </Button>
      }
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Full Name</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Phone</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((student) => (
              <tr key={student.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{student.fullName}</td>
                <td className="px-4 py-3 text-slate-500">{student.email}</td>
                <td className="px-4 py-3 text-slate-500">
                  {student.phoneCountryCode || student.phoneNo
                    ? `${student.phoneCountryCode ?? ''} ${student.phoneNo ?? ''}`.trim()
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      student.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {student.status}
                  </span>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No students yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog isOpen={isBulkOpen} onClose={closeBulkDialog} title="Bulk Register Students">
        {results ? (
          <div className="space-y-4">
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {results.map((result) => (
                <div key={result.email} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-slate-900">{result.email}</span>
                  <span
                    className={result.status === 'created' ? 'text-green-600' : 'text-slate-400'}
                  >
                    {result.status === 'created' ? 'Created' : (result.reason ?? 'Skipped')}
                  </span>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={closeBulkDialog}>
              Done
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submitBulkRegister}>
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <Input
                      id={`fullName-${index}`}
                      label={index === 0 ? 'Full Name' : undefined}
                      value={row.fullName}
                      onChange={(e) => updateRow(index, 'fullName', e.target.value)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Input
                      id={`email-${index}`}
                      label={index === 0 ? 'Email' : undefined}
                      type="email"
                      value={row.email}
                      onChange={(e) => updateRow(index, 'email', e.target.value)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Input
                      id={`phone-${index}`}
                      label={index === 0 ? 'Phone' : undefined}
                      value={row.phoneNo}
                      onChange={(e) => updateRow(index, 'phoneNo', e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="mb-2.5 shrink-0 text-slate-400 hover:text-red-600"
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="plus" className="mr-1.5 h-4 w-4" />}
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
            >
              Add row
            </Button>
            <Button type="submit" className="w-full" isLoading={submitting} loadingLabel="Registering...">
              Register
            </Button>
          </form>
        )}
      </Dialog>
    </AdminLayout>
  );
}
