'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteDialog, ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { FeatureGate } from '@/components/ui/FeatureGate';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { PhoneField } from '@/components/ui/PhoneField';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import type { SelectOption } from '@/components/ui/SearchableSelect';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { parsePhone } from '@/lib/phone';

type Tab = 'platform' | 'tenant';

type ManagedUser = {
  id: string;
  email: string;
  fullName: string;
  phoneCountryCode: string | null;
  phoneNo: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  role: 'SUPER_ADMIN' | 'USER';
  tenantId: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  lastSignInAt: string | null;
};

const STATUS_BADGE_CLASSES: Record<ManagedUser['status'], string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
  SUSPENDED: 'bg-red-100 text-red-700',
};

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function validateUserForm(prefix: 'create' | 'edit', fullName: string, email: string, phoneNo: string) {
  if (!fullName.trim()) return { error: "Please enter the user's full name", field: `${prefix}FullName` };
  if (!email.trim()) return { error: 'Please enter an email address', field: `${prefix}Email` };
  if (!phoneNo) return { error: 'Please enter a valid phone number', field: `${prefix}Phone` };
  return null;
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [activeTab, setActiveTab] = useState<Tab>('platform');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenants, setTenants] = useState<SelectOption[]>([]);
  const [departments, setDepartments] = useState<SelectOption[]>([]);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createFullName, setCreateFullName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createDialCode, setCreateDialCode] = useState('60');
  const [createDepartmentId, setCreateDepartmentId] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDialCode, setEditDialCode] = useState('60');
  const [editDepartmentId, setEditDepartmentId] = useState('');
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmResetPassword, setConfirmResetPassword] = useState(false);

  // ADMIN is always scoped to their own tenant; SUPER_ADMIN on the Tenant Users tab must pick one.
  const scopeTenantId = user?.role === 'ADMIN' ? (user.tenant?.id ?? '') : selectedTenantId;
  // ADMIN has no tab switcher (always scoped to their own tenant), so treat their view as
  // 'tenant' regardless of the 'platform'-defaulted activeTab state — otherwise the initial
  // request goes out as scope=platform, which the backend correctly 403s for a non-SUPER_ADMIN.
  const effectiveTab: Tab = isSuperAdmin ? activeTab : 'tenant';

  // Derived rather than cleared via setState-in-effect: avoids showing stale
  // previous-scope data without a synchronous setState in the load effect.
  const visibleUsers = effectiveTab === 'tenant' && !scopeTenantId ? [] : users;
  const visibleTotal = effectiveTab === 'tenant' && !scopeTenantId ? 0 : total;
  const visibleDepartments = scopeTenantId ? departments : [];

  const load = () => {
    if (effectiveTab === 'tenant' && !scopeTenantId) return;
    const params = new URLSearchParams({ scope: effectiveTab, page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (effectiveTab === 'tenant' && scopeTenantId) params.set('tenantId', scopeTenantId);
    fetch(`${apiUrl}/users?${params.toString()}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: ManagedUser[]; total: number }) => {
        setUsers(res.data);
        setTotal(res.total);
      })
      .catch(() => {});
  };

  const loadDepartments = () => {
    if (!scopeTenantId) return;
    fetch(`${apiUrl}/departments?tenantId=${scopeTenantId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) =>
        setDepartments(data.map((d) => ({ value: d.id, label: d.name }))),
      )
      .catch(() => {});
  };

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router, effectiveTab, scopeTenantId, page, debouncedSearch]);

  useEffect(() => {
    if (!user || effectiveTab !== 'tenant') return;
    if (isSuperAdmin) {
      fetch(`${apiUrl}/tenants`, { headers: authHeaders() })
        .then((r) => r.json())
        .then((data: { id: string; name: string }[]) =>
          setTenants(data.map((t) => ({ value: t.id, label: t.name }))),
        )
        .catch(() => {});
    }
    loadDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, effectiveTab, scopeTenantId]);

  const columns: AdminTableColumn<ManagedUser>[] = [
    { header: 'Full Name', render: (row) => row.fullName },
    { header: 'Email Address', render: (row) => row.email },
    {
      header: 'Phone Number',
      render: (row) =>
        row.phoneCountryCode || row.phoneNo ? `${row.phoneCountryCode ?? ''}${row.phoneNo ?? ''}`.trim() : '—',
    },
    {
      header: 'Department',
      hidden: effectiveTab === 'platform',
      render: (row) => row.department?.name ?? '—',
    },
    {
      header: 'Status',
      render: (row) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[row.status]}`}>
          {row.status}
        </span>
      ),
    },
  ];

  if (user && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') return null;

  const openCreateDialog = () => setIsCreateOpen(true);

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateFullName('');
    setCreateEmail('');
    setCreatePhone('');
    setCreateDialCode('60');
    setCreateDepartmentId('');
    setCreateError('');
  };

  const createUser = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const { phoneCountryCode, phoneNo } = parsePhone(createPhone, createDialCode);
    const validation = validateUserForm('create', createFullName, createEmail, phoneNo);
    if (validation) {
      setCreateError(validation.error);
      setTimeout(() => document.getElementById(validation.field)?.focus(), 0);
      return;
    }
    setIsCreating(true);
    setCreateError('');
    const res = await fetch(`${apiUrl}/users`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: effectiveTab,
        fullName: createFullName,
        email: createEmail,
        phoneCountryCode,
        phoneNo,
        departmentId: effectiveTab === 'tenant' ? createDepartmentId || undefined : undefined,
        tenantId: effectiveTab === 'tenant' && isSuperAdmin ? scopeTenantId : undefined,
      }),
    });
    setIsCreating(false);
    if (!res.ok) {
      if (res.status === 409) setCreateError('Email already registered');
      else setCreateError('Failed to create user');
      return;
    }
    toast.saved();
    closeCreateDialog();
    load();
  };

  const openEditDialog = (row: ManagedUser) => {
    setEditingUser(row);
    setEditFullName(row.fullName);
    setEditEmail(row.email);
    setEditPhone(row.phoneCountryCode && row.phoneNo ? `+${row.phoneCountryCode}${row.phoneNo}` : '');
    setEditDialCode(row.phoneCountryCode || '60');
    setEditDepartmentId(row.departmentId ?? '');
    setEditError('');
  };

  const closeEditDialog = () => {
    setEditingUser(null);
    setConfirmDelete(false);
    setConfirmResetPassword(false);
  };

  const saveUser = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!editingUser) return;
    const { phoneCountryCode, phoneNo } = parsePhone(editPhone, editDialCode);
    const validation = validateUserForm('edit', editFullName, editEmail, phoneNo);
    if (validation) {
      setEditError(validation.error);
      setTimeout(() => document.getElementById(validation.field)?.focus(), 0);
      return;
    }
    setIsSaving(true);
    setEditError('');
    const res = await fetch(`${apiUrl}/users/${editingUser.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: editFullName,
        email: editEmail,
        phoneCountryCode,
        phoneNo,
        departmentId: editingUser.role === 'USER' ? editDepartmentId || undefined : undefined,
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

  const resetUserPassword = async () => {
    if (!editingUser) return;
    const res = await fetch(`${apiUrl}/users/${editingUser.id}/reset-password`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.reset();
  };

  const deleteUser = async () => {
    if (!editingUser) return;
    const res = await fetch(`${apiUrl}/users/${editingUser.id}`, {
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

  return (
    <AdminLayout
      title="Users"
      backHref="/admin"
      actions={
        <Button onClick={openCreateDialog} variant="gradient">
          New User
        </Button>
      }
    >
      <FeatureGate featureKey="user-management">
        {isSuperAdmin && (
          <div className="mb-4 flex gap-2">
            {(['platform', 'tenant'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setPage(1);
                }}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === tab
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab === 'platform' ? 'Platform Admins' : 'Tenant Users'}
              </button>
            ))}
          </div>
        )}

        <AdminTable
          columns={columns}
          data={visibleUsers}
          keyField="id"
          onRowClick={openEditDialog}
          emptyMessage={
            effectiveTab === 'tenant' && !scopeTenantId
              ? 'Select a tenant to view its users.'
              : visibleTotal === 0 && !debouncedSearch
                ? 'No users yet.'
                : 'No users match your search.'
          }
          pagination={{ page, pageSize, total: visibleTotal, onPageChange: setPage }}
          toolbar={
            <>
              <div className="flex-1 min-w-50">
                <Input
                  id="searchUsers"
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by full name, email address, or phone number..."
                  value={search}
                />
              </div>
              {isSuperAdmin && activeTab === 'tenant' && (
                <div className="w-56">
                  <SearchableSelect
                    id="tenantFilter"
                    placeholder="Select tenant..."
                    options={tenants}
                    value={selectedTenantId}
                    onChange={(value) => {
                      setSelectedTenantId(value);
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </>
          }
        />
      </FeatureGate>

      <Dialog isOpen={isCreateOpen} onClose={closeCreateDialog} title="New User">
        <form className="space-y-5" onSubmit={createUser} noValidate>
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
          {effectiveTab === 'tenant' && (
            <SearchableSelect
              id="createDepartmentId"
              label="Department"
              options={visibleDepartments}
              value={createDepartmentId}
              onChange={setCreateDepartmentId}
            />
          )}
          {createError && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {createError}
            </Alert>
          )}
          <Button type="submit" isLoading={isCreating} loadingLabel="Creating...">
            Create User
          </Button>
        </form>
      </Dialog>

      <Dialog isOpen={editingUser !== null} onClose={closeEditDialog} title="Edit User">
        <form className="space-y-5" onSubmit={saveUser} noValidate>
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
          {editingUser?.role === 'USER' && (
            <SearchableSelect
              id="editDepartmentId"
              label="Department"
              options={visibleDepartments}
              value={editDepartmentId}
              onChange={setEditDepartmentId}
            />
          )}
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
        onConfirm={deleteUser}
        title="Delete User"
        userEmail={user?.email ?? ''}
      />

      <ConfirmDialog
        isOpen={confirmResetPassword}
        onClose={() => setConfirmResetPassword(false)}
        onConfirm={resetUserPassword}
        title="Reset Password"
        description={`Reset password for ${editingUser?.email ?? 'this user'}? They will need to set a new password on next login.`}
        confirmLabel="Reset Password"
      />
    </AdminLayout>
  );
}
