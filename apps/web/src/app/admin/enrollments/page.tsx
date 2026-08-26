'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteDialog, Dialog } from '@/components/ui/Dialog';
import { FileUpload } from '@/components/ui/FileUpload';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { formatSessionDateRange } from '@/lib/eventTime';

type Enrollment = {
  id: string;
  expiresAt: string | null;
  student: { user: { fullName: string; email: string } | null } | null;
  tenant: { id: string; name: string } | null;
  series: { id: string; name: string } | null;
  course: { id: string; title: string; startDate: string | null; endDate: string | null } | null;
  agent: { id: string; name: string } | null;
};

type ContentType = 'SERIES' | 'COURSE' | 'AGENT';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

// Course titles can repeat across instances (re-run cohorts) — the date range is what
// disambiguates them, same formatting as the Learn page. Omitted entirely (not just blank) when
// there's no date range, since formatSessionDateRange returns null for an undated course.
function courseLabel(title: string, startDate: string | null, endDate: string | null) {
  const range = formatSessionDateRange(startDate, endDate);
  return range ? `${title} (${range})` : title;
}

function validateEnrollmentForm(
  assignId: string,
  contentType: ContentType,
  seriesId: string,
  courseId: string,
  agentId: string,
) {
  if (!assignId) return { error: 'Please select a student or tenant', field: 'assignId' };
  if (contentType === 'SERIES' && !seriesId) {
    return { error: 'Please select a course series', field: 'assignSeriesId' };
  }
  if (contentType === 'COURSE' && !courseId) {
    return { error: 'Please select a course', field: 'assignCourseId' };
  }
  if (contentType === 'AGENT' && !agentId) {
    return { error: 'Please select an AI agent', field: 'assignAgentId' };
  }
  return null;
}

// Derives which of the three targets a row actually has — replaces the old binary
// `series !== null` ternary now that there's a third option.
function targetTypeOf(enrollment: Pick<Enrollment, 'series' | 'course' | 'agent'>): ContentType {
  if (enrollment.series) return 'SERIES';
  if (enrollment.agent) return 'AGENT';
  return 'COURSE';
}

type BulkEmailInput = { email: string; rowNumber: number };
type BulkResult = { email: string; status: 'created' | 'skipped'; reason?: string };
type RowStatus = 'error' | 'duplicate' | 'ok';
type PreviewRow = BulkEmailInput & { status: RowStatus; reason?: string; matchedName?: string };

const STATUS_LABELS: Record<Exclude<RowStatus, 'ok'>, string> = {
  error: 'Error',
  duplicate: 'Duplicate',
};

const STATUS_BADGE_CLASSES: Record<Exclude<RowStatus, 'ok'>, string> = {
  error: 'bg-red-100 text-red-700',
  duplicate: 'bg-blue-100 text-blue-700',
};

const STATUS_SORT_ORDER: Record<Exclude<RowStatus, 'ok'>, number> = {
  error: 0,
  duplicate: 1,
};

// Only Error/Duplicate here — Bulk Register Students also has a Warning tier (its heuristic
// "email doesn't end in .com" check), which has no equivalent for enrolling existing students.
function classifyBulkEmails(
  rows: BulkEmailInput[],
  students: { studentId: string; fullName: string; email: string }[],
): PreviewRow[] {
  const byEmail = new Map(students.map((s) => [s.email.toLowerCase(), s]));
  const seen = new Set<string>();

  return rows.map((row) => {
    const email = row.email.toLowerCase();
    if (!email) return { ...row, status: 'error', reason: 'email address missing' };

    const match = byEmail.get(email);
    if (!match) return { ...row, status: 'error', reason: 'no student found with this email' };

    if (seen.has(email)) {
      return { ...row, status: 'duplicate', reason: 'duplicate email in file', matchedName: match.fullName };
    }
    seen.add(email);
    return { ...row, status: 'ok', matchedName: match.fullName };
  });
}

const BULK_ENROLL_TEMPLATE_CSV = 'Email\njane@example.com\n';

function downloadBulkEnrollTemplate() {
  // BOM prefix + explicit charset so Excel on Windows/Mac reliably detects UTF-8 instead of guessing.
  const blob = new Blob(['﻿' + BULK_ENROLL_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bulk-enroll-template.csv';
  a.click();
  URL.revokeObjectURL(url);
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
  const [allStudents, setAllStudents] = useState<{ studentId: string; fullName: string; email: string }[]>([]);
  const [tenants, setTenants] = useState<{ value: string; label: string }[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<{ value: string; label: string }[]>([]);
  const [courseOptions, setCourseOptions] = useState<{ value: string; label: string }[]>([]);
  const [agentOptions, setAgentOptions] = useState<{ value: string; label: string }[]>([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [debouncedCourseSearch, setDebouncedCourseSearch] = useState('');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [assignType, setAssignType] = useState<'STUDENT' | 'TENANT'>('STUDENT');
  const [assignId, setAssignId] = useState('');
  const [assignContentType, setAssignContentType] = useState<ContentType>('SERIES');
  const [assignSeriesId, setAssignSeriesId] = useState('');
  const [assignCourseId, setAssignCourseId] = useState('');
  const [assignAgentId, setAssignAgentId] = useState('');
  const [assignExpiresAt, setAssignExpiresAt] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkContentType, setBulkContentType] = useState<ContentType>('SERIES');
  const [bulkSeriesId, setBulkSeriesId] = useState('');
  const [bulkCourseId, setBulkCourseId] = useState('');
  const [bulkAgentId, setBulkAgentId] = useState('');
  const [bulkExpiresAt, setBulkExpiresAt] = useState('');
  const [bulkError, setBulkError] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [bulkUploaded, setBulkUploaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [editingEnrollment, setEditingEnrollment] = useState<Enrollment | null>(null);
  const [editSeriesId, setEditSeriesId] = useState('');
  const [editCourseId, setEditCourseId] = useState('');
  const [editAgentId, setEditAgentId] = useState('');
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
    const handle = setTimeout(() => setDebouncedCourseSearch(courseSearch.trim()), 300);
    return () => clearTimeout(handle);
  }, [courseSearch]);

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
      .then((res: { data: { studentId: string; fullName: string; email: string }[] }) => {
        setStudents(res.data.map((s) => ({ value: s.studentId, label: `${s.fullName} (${s.email})` })));
        setAllStudents(res.data);
      })
      .catch(() => {});
    fetch(`${apiUrl}/tenants`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) =>
        setTenants(data.map((t) => ({ value: t.id, label: t.name }))),
      )
      .catch(() => {});
    fetch(`${apiUrl}/course-series?hasCourses=true`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) =>
        setSeriesOptions(data.map((s) => ({ value: s.id, label: s.name }))),
      )
      .catch(() => {});
    // Only series-less agents need a *direct* Enrollment — series-linked agents are already
    // covered by their series' Enrollment.
    fetch(`${apiUrl}/ai-agents?hasSeries=false&pageSize=1000`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: { id: string; name: string }[] }) =>
        setAgentOptions(res.data.map((a) => ({ value: a.id, label: a.name }))),
      )
      .catch(() => {});
  }, [user]);

  // Debounced server-side search — the course catalog can grow large over years of content, so
  // this re-queries GET /courses/admin/list as the admin types rather than prefetching everything.
  useEffect(() => {
    if (!user || user.role !== 'SUPER_ADMIN') return;
    const params = new URLSearchParams({ page: '1', pageSize: '20' });
    if (debouncedCourseSearch) params.set('search', debouncedCourseSearch);
    fetch(`${apiUrl}/courses/admin/list?${params.toString()}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: { id: string; title: string; startDate: string | null; endDate: string | null }[] }) =>
        setCourseOptions(res.data.map((c) => ({ value: c.id, label: courseLabel(c.title, c.startDate, c.endDate) }))),
      )
      .catch(() => {});
  }, [user, debouncedCourseSearch]);

  const columns: AdminTableColumn<Enrollment>[] = [
    {
      header: 'Student / Tenant',
      render: (enrollment) => (
        <div>
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
          {enrollment.student?.user?.fullName && enrollment.student.user.email && (
            <div className="text-xs text-slate-400">{enrollment.student.user.email}</div>
          )}
        </div>
      ),
    },
    {
      header: 'Course / Series / Agent',
      render: (enrollment) => {
        const targetType = targetTypeOf(enrollment);
        const label =
          targetType === 'SERIES'
            ? enrollment.series!.name
            : targetType === 'AGENT'
              ? enrollment.agent!.name
              : courseLabel(enrollment.course!.title, enrollment.course!.startDate, enrollment.course!.endDate);
        const pillClass =
          targetType === 'SERIES'
            ? 'bg-indigo-50 text-indigo-700'
            : targetType === 'AGENT'
              ? 'bg-violet-50 text-violet-700'
              : 'bg-amber-50 text-amber-700';
        const pillLabel = targetType === 'SERIES' ? 'Series' : targetType === 'AGENT' ? 'AI Agent' : 'Course';
        return (
          <span>
            {label}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-normal ${pillClass}`}>{pillLabel}</span>
          </span>
        );
      },
    },
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
    setAssignContentType('SERIES');
    setAssignSeriesId('');
    setAssignCourseId('');
    setAssignAgentId('');
    setAssignExpiresAt('');
    setCreateError('');
  };

  const createEnrollment = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const validation = validateEnrollmentForm(
      assignId,
      assignContentType,
      assignSeriesId,
      assignCourseId,
      assignAgentId,
    );
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
        seriesId: assignContentType === 'SERIES' ? assignSeriesId : undefined,
        courseId: assignContentType === 'COURSE' ? assignCourseId : undefined,
        agentId: assignContentType === 'AGENT' ? assignAgentId : undefined,
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

  const closeBulkDialog = () => {
    setIsBulkOpen(false);
    setBulkContentType('SERIES');
    setBulkSeriesId('');
    setBulkCourseId('');
    setBulkAgentId('');
    setBulkExpiresAt('');
    setBulkError('');
    setPreviewRows(null);
    setBulkUploaded(false);
  };

  const backToBulkTargetStep = () => {
    setPreviewRows(null);
    setBulkUploaded(false);
  };

  const parseBulkFile = (file: File) => {
    setBulkError('');
    const targetId =
      bulkContentType === 'SERIES' ? bulkSeriesId : bulkContentType === 'COURSE' ? bulkCourseId : bulkAgentId;
    if (!targetId) {
      setBulkError('Please select an enrollment target first');
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (parsed) => {
        const rows: BulkEmailInput[] = parsed.data.map((row, index) => ({
          email: (row.email ?? '').trim(),
          rowNumber: index + 2, // +2: header occupies row 1, so the first data row is row 2
        }));
        if (rows.length === 0) {
          setBulkError('No rows found in file');
          return;
        }
        setPreviewRows(classifyBulkEmails(rows, allStudents));
      },
      error: () => setBulkError('Failed to read file'),
    });
  };

  const confirmBulkUpload = async () => {
    if (!previewRows) return;
    const uploadable = previewRows.filter((row) => row.status === 'ok');
    if (uploadable.length === 0) return;
    setSubmitting(true);
    const res = await fetch(`${apiUrl}/enrollments/bulk`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emails: uploadable.map((row) => row.email),
        seriesId: bulkContentType === 'SERIES' ? bulkSeriesId : undefined,
        courseId: bulkContentType === 'COURSE' ? bulkCourseId : undefined,
        agentId: bulkContentType === 'AGENT' ? bulkAgentId : undefined,
        expiresAt: bulkExpiresAt || undefined,
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
          return { ...row, status: 'duplicate', reason: outcome.reason ?? 'Already enrolled' };
        }
        return row;
      }),
    );
    setBulkUploaded(true);
    toast.saved();
    loadEnrollments();
  };

  const openEditDialog = (enrollment: Enrollment) => {
    setEditingEnrollment(enrollment);
    setEditSeriesId(enrollment.series?.id ?? '');
    setEditCourseId(enrollment.course?.id ?? '');
    setEditAgentId(enrollment.agent?.id ?? '');
    // Seed the picker so the currently-assigned course shows its label immediately, before any
    // debounced search re-fetches and potentially narrows courseOptions away from it.
    const course = enrollment.course;
    if (course) {
      setCourseOptions((prev) =>
        prev.some((o) => o.value === course.id)
          ? prev
          : [{ value: course.id, label: courseLabel(course.title, course.startDate, course.endDate) }, ...prev],
      );
    }
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
    const targetType = targetTypeOf(editingEnrollment);
    if (targetType === 'SERIES' && !editSeriesId) {
      setEditError('Please select a course series');
      return;
    }
    if (targetType === 'COURSE' && !editCourseId) {
      setEditError('Please select a course');
      return;
    }
    if (targetType === 'AGENT' && !editAgentId) {
      setEditError('Please select an AI agent');
      return;
    }
    setIsSaving(true);
    setEditError('');
    const res = await fetch(`${apiUrl}/enrollments/${editingEnrollment.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesId: targetType === 'SERIES' ? editSeriesId : undefined,
        courseId: targetType === 'COURSE' ? editCourseId : undefined,
        agentId: targetType === 'AGENT' ? editAgentId : undefined,
        expiresAt: editExpiresAt || undefined,
      }),
    });
    setIsSaving(false);
    if (!res.ok) {
      setEditError(res.status === 409 ? 'Already enrolled' : 'Failed to save enrollment');
      return;
    }
    toast.saved();
    closeEditDialog();
    loadEnrollments();
  };

  const uploadableCount = previewRows?.filter((row) => row.status === 'ok').length ?? 0;

  const flaggedRows: (PreviewRow & { status: Exclude<RowStatus, 'ok'> })[] = (
    previewRows?.filter((row): row is PreviewRow & { status: Exclude<RowStatus, 'ok'> } => row.status !== 'ok') ?? []
  ).sort((a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status]);

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
        <>
          <Button
            leftIcon={<Icon name="upload" className="mr-1.5 h-4 w-4" />}
            onClick={() => setIsBulkOpen(true)}
            variant="secondary"
          >
            Bulk Enroll
          </Button>
          <Button
            leftIcon={<Icon name="plus" className="mr-1.5 h-4 w-4" />}
            onClick={() => setIsCreateOpen(true)}
            variant="gradient"
          >
            New Enrollment
          </Button>
        </>
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
              placeholder="Search by student, email, tenant, course series, or course..."
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
          <RadioGroup
            label="Enrollment Type"
            name="assignContentType"
            onChange={(value) => {
              setAssignContentType(value as ContentType);
              setAssignSeriesId('');
              setAssignCourseId('');
              setAssignAgentId('');
            }}
            options={[
              { label: 'Course Series', value: 'SERIES' },
              { label: 'Individual Course', value: 'COURSE' },
              { label: 'AI Agent', value: 'AGENT' },
            ]}
            value={assignContentType}
          />
          {assignContentType === 'SERIES' && (
            <SearchableSelect
              id="assignSeriesId"
              label="Course Series"
              onChange={setAssignSeriesId}
              options={seriesOptions}
              required
              value={assignSeriesId}
            />
          )}
          {assignContentType === 'COURSE' && (
            <SearchableSelect
              id="assignCourseId"
              label="Individual Course"
              onChange={setAssignCourseId}
              onQueryChange={setCourseSearch}
              options={courseOptions}
              required
              value={assignCourseId}
            />
          )}
          {assignContentType === 'AGENT' && (
            <SearchableSelect
              id="assignAgentId"
              label="AI Agent"
              onChange={setAssignAgentId}
              options={agentOptions}
              required
              value={assignAgentId}
            />
          )}
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

      <Dialog isOpen={isBulkOpen} onClose={closeBulkDialog} title="Bulk Enroll Students" size="xl">
        {previewRows ? (
          <div className="space-y-4">
            {bulkUploaded ? (
              <p className="text-sm text-slate-600">
                {previewRows.filter((row) => row.status === 'ok').length} created,{' '}
                {previewRows.filter((row) => row.status !== 'ok').length} failed
              </p>
            ) : (
              <div>
                <p className="mb-2 font-semibold text-slate-900">Preview ({previewRows.length} rows)</p>
                <div className="flex gap-2">
                  {(['error', 'duplicate'] as const).map((status) => {
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
                {bulkUploaded ? 'All rows were processed successfully.' : 'All rows are valid and ready to be enrolled.'}
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Row</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Email</th>
                      <th className="px-4 py-2 text-left">Name</th>
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
                        <td className="px-4 py-2 text-slate-500">{row.email || '—'}</td>
                        <td className="px-4 py-2 text-slate-900">{row.matchedName ?? '—'}</td>
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
                <Button type="button" variant="secondary" onClick={backToBulkTargetStep}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={confirmBulkUpload}
                  disabled={uploadableCount === 0}
                  isLoading={submitting}
                  loadingLabel="Enrolling..."
                >
                  Enroll {uploadableCount} Student{uploadableCount === 1 ? '' : 's'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <RadioGroup
              label="Enroll in"
              name="bulkContentType"
              onChange={(value) => {
                setBulkContentType(value as ContentType);
                setBulkSeriesId('');
                setBulkCourseId('');
                setBulkAgentId('');
              }}
              options={[
                { label: 'Course Series', value: 'SERIES' },
                { label: 'Individual Course', value: 'COURSE' },
                { label: 'AI Agent', value: 'AGENT' },
              ]}
              value={bulkContentType}
            />
            {bulkContentType === 'SERIES' && (
              <SearchableSelect
                id="bulkSeriesId"
                label="Course Series"
                onChange={setBulkSeriesId}
                options={seriesOptions}
                required
                value={bulkSeriesId}
              />
            )}
            {bulkContentType === 'COURSE' && (
              <SearchableSelect
                id="bulkCourseId"
                label="Individual Course"
                onChange={setBulkCourseId}
                onQueryChange={setCourseSearch}
                options={courseOptions}
                required
                value={bulkCourseId}
              />
            )}
            {bulkContentType === 'AGENT' && (
              <SearchableSelect
                id="bulkAgentId"
                label="AI Agent"
                onChange={setBulkAgentId}
                options={agentOptions}
                required
                value={bulkAgentId}
              />
            )}
            <Input
              id="bulkExpiresAt"
              label="Expires At"
              type="date"
              value={bulkExpiresAt}
              onChange={(e) => setBulkExpiresAt(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={downloadBulkEnrollTemplate}
              leftIcon={<Icon name="download" className="h-4 w-4 mr-1.5" />}
            >
              Download Template
            </Button>
            <FileUpload
              id="bulkEnrollFile"
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
          {editingEnrollment && targetTypeOf(editingEnrollment) === 'SERIES' && (
            <SearchableSelect
              id="editSeriesId"
              label="Course Series"
              onChange={setEditSeriesId}
              options={seriesOptions}
              required
              value={editSeriesId}
            />
          )}
          {editingEnrollment && targetTypeOf(editingEnrollment) === 'COURSE' && (
            <SearchableSelect
              id="editCourseId"
              label="Individual Course"
              onChange={setEditCourseId}
              onQueryChange={setCourseSearch}
              options={courseOptions}
              required
              value={editCourseId}
            />
          )}
          {editingEnrollment && targetTypeOf(editingEnrollment) === 'AGENT' && (
            <SearchableSelect
              id="editAgentId"
              label="AI Agent"
              onChange={setEditAgentId}
              options={agentOptions}
              required
              value={editAgentId}
            />
          )}
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
