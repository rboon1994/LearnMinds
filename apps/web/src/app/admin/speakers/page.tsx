'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteDialog, Dialog } from '@/components/ui/Dialog';
import { FeatureGate } from '@/components/ui/FeatureGate';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

type Speaker = {
  id: string;
  name: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
};

export default function AdminSpeakersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [speakers, setSpeakers] = useState<Speaker[]>([]);

  const [searchName, setSearchName] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createThumbnail, setCreateThumbnail] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingSpeaker, setEditingSpeaker] = useState<Speaker | null>(null);
  const [editName, setEditName] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editThumbnail, setEditThumbnail] = useState('');
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchSpeakers = () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    fetch(`${apiUrl}/speakers?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((res: { data: Speaker[]; total: number }) => {
        setSpeakers(res.data);
        setTotal(res.total);
      })
      .catch(() => {});
  };

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchName.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchName]);

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/admin');
      return;
    }
    fetchSpeakers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router, page, debouncedSearch]);

  const columns: AdminTableColumn<Speaker>[] = [
    {
      header: 'Speaker',
      className: 'font-medium text-slate-900',
      render: (speaker) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
            {speaker.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={speaker.thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <Icon name="user" className="h-5 w-5 text-slate-300" />
            )}
          </div>
          <span>{speaker.name}</span>
        </div>
      ),
    },
    { header: 'Title', render: (speaker) => speaker.title },
    {
      header: 'Description',
      className: 'max-w-xs truncate',
      render: (speaker) => speaker.description ?? '—',
    },
  ];

  const openCreateDialog = () => setIsCreateOpen(true);

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateName('');
    setCreateTitle('');
    setCreateDescription('');
    setCreateThumbnail('');
    setCreateError('');
  };

  const createSpeaker = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!createName.trim() || !createTitle.trim()) {
      setCreateError('Name and title are required');
      return;
    }
    setIsCreating(true);
    setCreateError('');
    const token = localStorage.getItem('token');
    const res = await fetch(`${apiUrl}/speakers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createName,
        title: createTitle,
        description: createDescription || undefined,
        thumbnail: createThumbnail || undefined,
      }),
    });
    setIsCreating(false);
    if (!res.ok) {
      setCreateError('Failed to create speaker');
      return;
    }
    await res.json();
    closeCreateDialog();
    fetchSpeakers();
  };

  const openEditDialog = (speaker: Speaker) => {
    setEditingSpeaker(speaker);
    setEditName(speaker.name);
    setEditTitle(speaker.title);
    setEditDescription(speaker.description ?? '');
    setEditThumbnail(speaker.thumbnail ?? '');
    setEditError('');
  };

  const closeEditDialog = () => {
    setEditingSpeaker(null);
    setConfirmDelete(false);
  };

  const saveSpeaker = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!editingSpeaker) return;
    if (!editName.trim() || !editTitle.trim()) {
      setEditError('Name and title are required');
      return;
    }
    setIsSaving(true);
    setEditError('');
    const res = await fetch(`${apiUrl}/speakers/${editingSpeaker.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName,
        title: editTitle,
        description: editDescription || null,
        thumbnail: editThumbnail || null,
      }),
    });
    setIsSaving(false);
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.saved();
    closeEditDialog();
    fetchSpeakers();
  };

  const deleteSpeaker = async () => {
    if (!editingSpeaker) return;
    const res = await fetch(`${apiUrl}/speakers/${editingSpeaker.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
    closeEditDialog();
    fetchSpeakers();
  };

  if (user && user.role !== 'SUPER_ADMIN') return null;

  return (
    <AdminLayout
      title="Speakers"
      backHref="/admin"
      actions={
        <Button onClick={openCreateDialog} variant="gradient">
          New Speaker
        </Button>
      }
    >
      <FeatureGate featureKey="speaker-management">
        <AdminTable
          columns={columns}
          data={speakers}
          keyField="id"
          onRowClick={openEditDialog}
          emptyMessage={total === 0 && !debouncedSearch ? 'No speakers yet.' : 'No speakers match your search.'}
          pagination={{ page, pageSize, total, onPageChange: setPage }}
          toolbar={
            <div className="flex-1 min-w-50">
              <Input
                id="searchName"
                onChange={(e) => {
                  setSearchName(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name..."
                value={searchName}
              />
            </div>
          }
        />
      </FeatureGate>

      <Dialog isOpen={isCreateOpen} onClose={closeCreateDialog} title="New Speaker">
        <form className="space-y-5" onSubmit={createSpeaker} noValidate>
          <Input
            id="createName"
            label="Name"
            onChange={(e) => setCreateName(e.target.value)}
            required
            value={createName}
          />
          <Input
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
          {createError && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {createError}
            </Alert>
          )}
          <Button type="submit" isLoading={isCreating} loadingLabel="Creating...">
            Create Speaker
          </Button>
        </form>
      </Dialog>

      <Dialog isOpen={editingSpeaker !== null} onClose={closeEditDialog} title="Edit Speaker">
        <form className="space-y-5" onSubmit={saveSpeaker} noValidate>
          <Input id="editName" label="Name" onChange={(e) => setEditName(e.target.value)} required value={editName} />
          <Input
            id="editTitle"
            label="Title"
            onChange={(e) => setEditTitle(e.target.value)}
            required
            value={editTitle}
          />
          <Textarea
            id="editDescription"
            label="Description"
            onChange={(e) => setEditDescription(e.target.value)}
            rows={4}
            value={editDescription}
          />
          <Input
            id="editThumbnail"
            label="Thumbnail"
            onChange={(e) => setEditThumbnail(e.target.value)}
            placeholder="https://..."
            value={editThumbnail}
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
        onConfirm={deleteSpeaker}
        title="Delete Speaker"
        userEmail={user?.email ?? ''}
      />
    </AdminLayout>
  );
}
