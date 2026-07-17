'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteDialog, ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { FileUpload } from '@/components/ui/FileUpload';
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
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  lastSignInAt: string | null;
};

type BulkStudentInput = {
  fullName: string;
  email: string;
  phoneCountryCode?: string;
  phoneNo?: string;
  rowNumber: number;
};

type BulkResult = { email: string; status: 'created' | 'skipped'; reason?: string };

type RowStatus = 'error' | 'duplicate' | 'warning' | 'ok';

type PreviewRow = BulkStudentInput & { status: RowStatus; reason?: string };

const STATUS_LABELS: Record<Exclude<RowStatus, 'ok'>, string> = {
  error: 'Error',
  duplicate: 'Duplicate',
  warning: 'Warning',
};

const STATUS_BADGE_CLASSES: Record<Exclude<RowStatus, 'ok'>, string> = {
  error: 'bg-red-100 text-red-700',
  duplicate: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
};

const STATUS_SORT_ORDER: Record<Exclude<RowStatus, 'ok'>, number> = {
  error: 0,
  duplicate: 1,
  warning: 2,
};

const ACCOUNT_STATUS_BADGE_CLASSES: Record<Student['status'], string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
  SUSPENDED: 'bg-red-100 text-red-700',
};

function phoneKey(row: { phoneCountryCode?: string | null; phoneNo?: string | null }) {
  return `${row.phoneCountryCode ?? ''}${row.phoneNo ?? ''}`;
}

// Strips spaces/dashes (e.g. "016-2809580", "016 2809580") and a redundant leading country code
// (e.g. countryCode "60" + phoneNo "60162809580") from a raw Phone No cell. Doesn't strip a local
// trunk "0" (e.g. "0162809580") — left as-is per explicit decision.
function normalizePhoneNo(countryCode: string, rawPhoneNo: string) {
  const digitsOnly = rawPhoneNo.replace(/[\s-]/g, '');
  if (countryCode && digitsOnly.startsWith(countryCode)) {
    return digitsOnly.slice(countryCode.length);
  }
  return digitsOnly;
}

// Classifies each parsed row against the already-loaded student list and against earlier rows in
// the same file. Error/Duplicate block the row from being uploaded; Warning is informational only.
function classifyBulkRows(rows: BulkStudentInput[], existingStudents: Student[]): PreviewRow[] {
  const dbEmails = new Set(existingStudents.map((s) => s.email.toLowerCase()));
  const dbPhones = new Set(existingStudents.filter((s) => phoneKey(s)).map((s) => phoneKey(s)));
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  return rows.map((row) => {
    const email = row.email.toLowerCase();
    const phone = phoneKey(row);

    const missing: string[] = [];
    if (!row.fullName) missing.push('name');
    if (!row.email) missing.push('email address');
    if (!row.phoneCountryCode) missing.push('country code');
    if (!row.phoneNo) missing.push('phone number');
    if (missing.length > 0) {
      return { ...row, status: 'error', reason: `${missing.join(' and ')} missing` };
    }

    const emailInDb = dbEmails.has(email);
    const emailInFile = seenEmails.has(email);
    const phoneInDb = dbPhones.has(phone);
    const phoneInFile = seenPhones.has(phone);
    seenEmails.add(email);
    seenPhones.add(phone);

    if (emailInDb || emailInFile || phoneInDb || phoneInFile) {
      const reasons: string[] = [];
      if (emailInDb) reasons.push('email address already exists in DB');
      else if (emailInFile) reasons.push('duplicate email address in file');
      if (phoneInDb) reasons.push('phone number already exists in DB');
      else if (phoneInFile) reasons.push('duplicate phone number in file');
      return { ...row, status: 'duplicate', reason: reasons.join('; ') };
    }

    if (!email.endsWith('.com')) {
      return { ...row, status: 'warning', reason: 'email address does not end with .com' };
    }

    return { ...row, status: 'ok' };
  });
}

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function validateStudentForm(prefix: 'create' | 'edit', fullName: string, email: string, phoneNo: string) {
  if (!fullName.trim()) return { error: "Please enter the student's full name", field: `${prefix}FullName` };
  if (!email.trim()) return { error: 'Please enter an email address', field: `${prefix}Email` };
  if (!phoneNo) return { error: 'Please enter a valid phone number', field: `${prefix}Phone` };
  return null;
}

const BULK_TEMPLATE_CSV = 'Full Name,Email,Phone Country Code,Phone No\nJane Tan,jane@example.com,60,123456789\n';

function downloadBulkTemplate() {
  // BOM prefix + explicit charset so Excel on Windows/Mac reliably detects UTF-8 instead of guessing.
  const blob = new Blob(['﻿' + BULK_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'students-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminStudentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [dedupStudents, setDedupStudents] = useState<Student[]>([]);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [bulkUploaded, setBulkUploaded] = useState(false);
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
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    fetch(`${apiUrl}/students?${params.toString()}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: Student[]; total: number }) => {
        setStudents(res.data);
        setTotal(res.total);
      })
      .catch(() => {});
  };

  // Full unpaginated list for the Bulk Register duplicate check — fetched separately (only when
  // that dialog opens) so the main table above can stay server-paginated.
  const loadDedupStudents = () => {
    fetch(`${apiUrl}/students?pageSize=100000`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: Student[]; total: number }) => setDedupStudents(res.data))
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router, page, debouncedSearch]);

  const uploadableCount =
    previewRows?.filter((row) => row.status !== 'error' && row.status !== 'duplicate').length ?? 0;

  const flaggedRows: (PreviewRow & { status: Exclude<RowStatus, 'ok'> })[] = (
    previewRows?.filter(
      (row): row is PreviewRow & { status: Exclude<RowStatus, 'ok'> } => row.status !== 'ok',
    ) ?? []
  ).sort((a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status]);

  const columns: AdminTableColumn<Student>[] = [
    { header: 'Full Name', render: (student) => student.fullName },
    { header: 'Email Address', render: (student) => student.email },
    {
      header: 'Phone Number',
      render: (student) =>
        student.phoneCountryCode || student.phoneNo
          ? `${student.phoneCountryCode ?? ''}${student.phoneNo ?? ''}`.trim()
          : '—',
    },
    {
      header: 'Status',
      render: (student) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACCOUNT_STATUS_BADGE_CLASSES[student.status]}`}
        >
          {student.status}
        </span>
      ),
    },
  ];

  if (user && user.role !== 'SUPER_ADMIN') return null;

  const closeBulkDialog = () => {
    setIsBulkOpen(false);
    setBulkError('');
    setPreviewRows(null);
    setBulkUploaded(false);
  };

  const backToBulkUpload = () => {
    setPreviewRows(null);
    setBulkUploaded(false);
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
    const { phoneCountryCode, phoneNo } = parsePhone(createPhone, createDialCode);
    const validation = validateStudentForm('create', createFullName, createEmail, phoneNo);
    if (validation) {
      setCreateError(validation.error);
      setTimeout(() => document.getElementById(validation.field)?.focus(), 0);
      return;
    }
    setIsCreating(true);
    setCreateError('');
    const res = await fetch(`${apiUrl}/students/bulk`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        students: [
          {
            fullName: createFullName,
            email: createEmail,
            phoneCountryCode,
            phoneNo,
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
      setCreateError(result.reason ?? 'Email address already registered');
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
    const { phoneCountryCode, phoneNo } = parsePhone(editPhone, editDialCode);
    const validation = validateStudentForm('edit', editFullName, editEmail, phoneNo);
    if (validation) {
      setEditError(validation.error);
      setTimeout(() => document.getElementById(validation.field)?.focus(), 0);
      return;
    }
    setIsSaving(true);
    setEditError('');
    const res = await fetch(`${apiUrl}/students/${editingStudent.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: editFullName,
        email: editEmail,
        phoneCountryCode,
        phoneNo,
      }),
    });
    setIsSaving(false);
    if (!res.ok) {
      if (res.status === 409) setEditError('Email address already registered');
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

  const parseBulkFile = (file: File) => {
    setBulkError('');
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, ''),
      complete: (parsed) => {
        const rows: BulkStudentInput[] = parsed.data.map((row, index) => {
          const entry: BulkStudentInput = {
            fullName: (row.fullname ?? '').trim(),
            email: (row.email ?? '').trim(),
            rowNumber: index + 2, // +2: header occupies row 1, so the first data row is row 2
          };
          const phoneCountryCode = (row.phonecountrycode ?? '').trim();
          const phoneNo = normalizePhoneNo(phoneCountryCode, (row.phoneno ?? '').trim());
          if (phoneCountryCode) entry.phoneCountryCode = phoneCountryCode;
          if (phoneNo) entry.phoneNo = phoneNo;
          return entry;
        });
        if (rows.length === 0) {
          setBulkError('No rows found in file');
          return;
        }
        setPreviewRows(classifyBulkRows(rows, dedupStudents));
      },
      error: () => setBulkError('Failed to read file'),
    });
  };

  const confirmBulkUpload = async () => {
    if (!previewRows) return;
    const uploadable = previewRows.filter((row) => row.status !== 'error' && row.status !== 'duplicate');
    if (uploadable.length === 0) return;
    setSubmitting(true);
    const res = await fetch(`${apiUrl}/students/bulk`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        students: uploadable.map(({ fullName, email, phoneCountryCode, phoneNo }) => ({
          fullName,
          email,
          phoneCountryCode,
          phoneNo,
        })),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    const data: BulkResult[] = await res.json();
    const outcomeByEmail = new Map(data.map((result) => [result.email, result]));
    setPreviewRows((prev) =>
      (prev ?? []).map((row) => {
        const outcome = outcomeByEmail.get(row.email);
        if (outcome?.status === 'skipped') {
          return { ...row, status: 'duplicate', reason: outcome.reason ?? 'Already registered' };
        }
        return row;
      }),
    );
    setBulkUploaded(true);
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
            leftIcon={<Icon name="upload" className="mr-1.5 h-4 w-4" />}
            onClick={() => {
              setIsBulkOpen(true);
              loadDedupStudents();
            }}
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
        data={students}
        keyField="id"
        onRowClick={openEditDialog}
        emptyMessage={total === 0 && !debouncedSearch ? 'No students yet.' : 'No students match your search.'}
        pagination={{ page, pageSize, total, onPageChange: setPage }}
        toolbar={
          <div className="flex-1 min-w-50">
            <Input
              id="searchStudents"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by full name, email address, or phone number..."
              value={search}
            />
          </div>
        }
      />

      <Dialog isOpen={isBulkOpen} onClose={closeBulkDialog} title="Bulk Register Students" size="xl">
        {previewRows ? (
          <div className="space-y-4">
            {bulkUploaded ? (
              <p className="text-sm text-slate-600">
                {previewRows.filter((row) => row.status === 'ok' || row.status === 'warning').length} created,{' '}
                {previewRows.filter((row) => row.status === 'error' || row.status === 'duplicate').length} failed
              </p>
            ) : (
              <div>
                <p className="mb-2 font-semibold text-slate-900">Preview ({previewRows.length} rows)</p>
                <div className="flex gap-2">
                  {(['error', 'duplicate', 'warning'] as const).map((status) => {
                    const count = previewRows.filter((row) => row.status === status).length;
                    if (count === 0) return null;
                    return (
                      <span
                        key={status}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}
                      >
                        {count} {STATUS_LABELS[status]}
                        {count > 1 ? 's' : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {flaggedRows.length === 0 ? (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-6 text-center text-sm text-green-700">
                {bulkUploaded ? 'All rows were processed successfully.' : 'All rows are valid and ready to be processed.'}
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Row</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">Email Address</th>
                      <th className="px-4 py-2 text-left">Phone Number</th>
                      <th className="px-4 py-2 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {flaggedRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="px-4 py-2 text-slate-500">{row.rowNumber}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[row.status]}`}
                          >
                            {STATUS_LABELS[row.status]}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-slate-900">{row.fullName || '—'}</td>
                        <td className="px-4 py-2 text-slate-500">{row.email || '—'}</td>
                        <td className="px-4 py-2 text-slate-500">
                          {row.phoneCountryCode || row.phoneNo ? phoneKey(row) : '—'}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{row.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {bulkUploaded ? (
              <Button className="w-full" onClick={closeBulkDialog}>
                Done
              </Button>
            ) : (
              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={backToBulkUpload}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={confirmBulkUpload}
                  disabled={uploadableCount === 0}
                  isLoading={submitting}
                  loadingLabel="Uploading..."
                >
                  Upload {uploadableCount} Row{uploadableCount === 1 ? '' : 's'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Button
              type="button"
              variant="secondary"
              onClick={downloadBulkTemplate}
              leftIcon={<Icon name="download" className="h-4 w-4 mr-1.5" />}
            >
              Download Template
            </Button>
            <FileUpload
              id="bulkFile"
              label="Upload completed template"
              accept=".csv"
              acceptLabel="CSV file, max 15MB"
              maxSizeBytes={15 * 1024 * 1024}
              onFilesSelected={(files) => {
                if (files[0]) parseBulkFile(files[0]);
              }}
            />
            {bulkError && (
              <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
                {bulkError}
              </Alert>
            )}
          </div>
        )}
      </Dialog>

      <Dialog isOpen={isCreateOpen} onClose={closeCreateDialog} title="New Student">
        <form className="space-y-5" onSubmit={createStudent} noValidate>
          <Input
            autoFocus
            id="createFullName"
            label="Full Name"
            onChange={(e) => setCreateFullName(e.target.value)}
            required
            value={createFullName}
          />
          <Input
            id="createEmail"
            label="Email Address"
            onChange={(e) => setCreateEmail(e.target.value)}
            required
            type="email"
            value={createEmail}
          />
          <PhoneField
            id="createPhone"
            label="Phone Number"
            required
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
            autoFocus
            id="editFullName"
            label="Full Name"
            onChange={(e) => setEditFullName(e.target.value)}
            required
            value={editFullName}
          />
          <Input
            id="editEmail"
            label="Email Address"
            onChange={(e) => setEditEmail(e.target.value)}
            required
            type="email"
            value={editEmail}
          />
          <PhoneField
            id="editPhone"
            label="Phone Number"
            required
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
