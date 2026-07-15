'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteDialog, ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { PhoneField } from '@/components/ui/PhoneField';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { parsePhone } from '@/lib/phone';

type Student = {
  id: string;
  email: string;
  fullName: string;
  phoneCountryCode: string | null;
  phoneNo: string | null;
  status: 'ACTIVE' | 'INACTIVE';
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
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [rows, setRows] = useState<StudentRow[]>([emptyRow()]);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createFullName, setCreateFullName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createDialCode, setCreateDialCode] = useState('60');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDialCode, setEditDialCode] = useState('60');
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmResetPassword, setConfirmResetPassword] = useState(false);

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

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const queryDigits = query.replace(/\D/g, '');
    if (!query) return students;
    return students.filter((student) => {
      const phoneDigits = `${student.phoneCountryCode ?? ''}${student.phoneNo ?? ''}`;
      return (
        student.fullName.toLowerCase().includes(query) ||
        student.email.toLowerCase().includes(query) ||
        (queryDigits && phoneDigits.includes(queryDigits))
      );
    });
  }, [students, search]);

  const pagedStudents = useMemo(
    () => filteredStudents.slice((page - 1) * pageSize, page * pageSize),
    [filteredStudents, page],
  );

  const columns: AdminTableColumn<Student>[] = [
    { header: 'Full Name', className: 'font-medium text-slate-900', render: (student) => student.fullName },
    { header: 'Email', render: (student) => student.email },
    {
      header: 'Phone',
      render: (student) =>
        student.phoneCountryCode || student.phoneNo
          ? `${student.phoneCountryCode ?? ''}${student.phoneNo ?? ''}`.trim()
          : '—',
    },
    {
      header: 'Status',
      render: (student) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            student.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {student.status}
        </span>
      ),
    },
  ];

  if (user && user.role !== 'SUPER_ADMIN') return null;

  const closeBulkDialog = () => {
    setIsBulkOpen(false);
    setRows([emptyRow()]);
    setResults(null);
  };

  const openCreateDialog = () => setIsCreateOpen(true);

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateFullName('');
    setCreateEmail('');
    setCreatePhone('');
    setCreateDialCode('60');
    setCreateError('');
  };

  const createStudent = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!createFullName.trim() || !createEmail.trim()) {
      setCreateError('Full name and email are required');
      return;
    }
    setIsCreating(true);
    setCreateError('');
    const { phoneCountryCode, phoneNo } = parsePhone(createPhone, createDialCode);
    const res = await fetch(`${apiUrl}/students/bulk`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        students: [
          {
            fullName: createFullName,
            email: createEmail,
            phoneCountryCode: phoneCountryCode || undefined,
            phoneNo: phoneNo || undefined,
          },
        ],
      }),
    });
    setIsCreating(false);
    if (!res.ok) {
      setCreateError('Failed to create student');
      return;
    }
    const [result]: BulkResult[] = await res.json();
    if (result.status === 'skipped') {
      setCreateError(result.reason ?? 'Email already registered');
      return;
    }
    toast.saved();
    closeCreateDialog();
    load();
  };

  const openEditDialog = (student: Student) => {
    setEditingStudent(student);
    setEditFullName(student.fullName);
    setEditEmail(student.email);
    setEditPhone(student.phoneCountryCode && student.phoneNo ? `+${student.phoneCountryCode}${student.phoneNo}` : '');
    setEditDialCode(student.phoneCountryCode || '60');
    setEditError('');
  };

  const closeEditDialog = () => {
    setEditingStudent(null);
    setConfirmDelete(false);
    setConfirmResetPassword(false);
  };

  const saveStudent = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!editingStudent) return;
    if (!editFullName.trim() || !editEmail.trim()) {
      setEditError('Full name and email are required');
      return;
    }
    setIsSaving(true);
    setEditError('');
    const { phoneCountryCode, phoneNo } = parsePhone(editPhone, editDialCode);
    const res = await fetch(`${apiUrl}/students/${editingStudent.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: editFullName,
        email: editEmail,
        phoneCountryCode: phoneCountryCode || undefined,
        phoneNo: phoneNo || undefined,
      }),
    });
    setIsSaving(false);
    if (!res.ok) {
      if (res.status === 409) setEditError('Email already registered');
      else toast.saveFailed();
      return;
    }
    toast.saved();
    closeEditDialog();
    load();
  };

  const resetStudentPassword = async () => {
    if (!editingStudent) return;
    const res = await fetch(`${apiUrl}/students/${editingStudent.id}/reset-password`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.reset();
  };

  const deleteStudent = async () => {
    if (!editingStudent) return;
    const res = await fetch(`${apiUrl}/students/${editingStudent.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
    closeEditDialog();
    load();
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
        <>
          <Button
            leftIcon={<Icon name="plus" className="mr-1.5 h-4 w-4" />}
            onClick={() => setIsBulkOpen(true)}
            variant="secondary"
          >
            Bulk Register
          </Button>
          <Button onClick={openCreateDialog} variant="gradient">
            New Student
          </Button>
        </>
      }
    >
      <AdminTable
        columns={columns}
        data={pagedStudents}
        keyField="id"
        onRowClick={openEditDialog}
        emptyMessage={students.length === 0 ? 'No students yet.' : 'No students match your search.'}
        pagination={{ page, pageSize, total: filteredStudents.length, onPageChange: setPage }}
        toolbar={
          <div className="flex-1 min-w-50">
            <Input
              id="searchStudents"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, email, or phone..."
              value={search}
            />
          </div>
        }
      />

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

      <Dialog isOpen={isCreateOpen} onClose={closeCreateDialog} title="New Student">
        <form className="space-y-5" onSubmit={createStudent} noValidate>
          <Input
            id="createFullName"
            label="Full Name"
            onChange={(e) => setCreateFullName(e.target.value)}
            required
            value={createFullName}
          />
          <Input
            id="createEmail"
            label="Email"
            onChange={(e) => setCreateEmail(e.target.value)}
            required
            type="email"
            value={createEmail}
          />
          <PhoneField
            id="createPhone"
            label="Phone"
            variant="default"
            onChange={(phone, dialCode) => {
              setCreatePhone(phone);
              setCreateDialCode(dialCode);
            }}
            value={createPhone}
          />
          {createError && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {createError}
            </Alert>
          )}
          <Button type="submit" isLoading={isCreating} loadingLabel="Creating...">
            Create Student
          </Button>
        </form>
      </Dialog>

      <Dialog isOpen={editingStudent !== null} onClose={closeEditDialog} title="Edit Student">
        <form className="space-y-5" onSubmit={saveStudent} noValidate>
          <Input
            id="editFullName"
            label="Full Name"
            onChange={(e) => setEditFullName(e.target.value)}
            required
            value={editFullName}
          />
          <Input
            id="editEmail"
            label="Email"
            onChange={(e) => setEditEmail(e.target.value)}
            required
            type="email"
            value={editEmail}
          />
          <PhoneField
            id="editPhone"
            label="Phone"
            variant="default"
            onChange={(phone, dialCode) => {
              setEditPhone(phone);
              setEditDialCode(dialCode);
            }}
            value={editPhone}
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
              variant="secondary"
              onClick={() => setConfirmResetPassword(true)}
              leftIcon={<Icon name="lock" className="h-4 w-4 mr-1.5" />}
            >
              Reset Password
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
        onConfirm={deleteStudent}
        title="Delete Student"
        userEmail={user?.email ?? ''}
      />

      <ConfirmDialog
        isOpen={confirmResetPassword}
        onClose={() => setConfirmResetPassword(false)}
        onConfirm={resetStudentPassword}
        title="Reset Password"
        description={`Reset password for ${editingStudent?.email ?? 'this student'}? They will need to set a new password on next login.`}
        confirmLabel="Reset Password"
      />
    </AdminLayout>
  );
}
