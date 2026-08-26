'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { formatSessionDate } from '@/lib/eventTime';

type NearestSession = {
  startDateTime: string;
  endDateTime: string;
  sessionType: 'WEBINAR' | 'ONLINE' | 'OFFLINE';
  venue: string | null;
};

type Event = {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED';
  sessions: { id: string }[];
  // The session nearest to "now" — soonest upcoming if one exists, else most recently ended.
  // Computed and sorted server-side (EventsService can't order by a value computed across the
  // sessions relation), so this page just reads it rather than re-deriving it.
  nearestSession: NearestSession | null;
};

// Admin-managed (see apps/api/src/event-categories) — replaces a former fixed enum, CRUD'd the
// same way Course's Series is: a "Manage Categories" dialog on this page, not a dedicated route.
type EventCategory = { id: string; name: string; _count: { events: number } };

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export default function AdminEventsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [events, setEvents] = useState<Event[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createThumbnail, setCreateThumbnail] = useState('');
  const [createCategories, setCreateCategories] = useState<string[]>([]);
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

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
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    fetch(`${apiUrl}/events/admin?${params.toString()}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: Event[]; total: number }) => {
        setEvents(res.data);
        setTotal(res.total);
      })
      .catch(() => {});
  }, [user, router, page, debouncedSearch]);

  const loadCategories = () => {
    fetch(`${apiUrl}/event-categories`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  };

  useEffect(() => {
    if (!user || user.role !== 'SUPER_ADMIN') return;
    loadCategories();
  }, [user]);

  if (user && user.role !== 'SUPER_ADMIN') return null;

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  const handleDuplicateOrSaveError = (res: Response) => {
    if (res.status === 409) toast.duplicateName();
    else toast.saveFailed();
  };

  const openCategoriesDialog = () => {
    setIsCategoriesOpen(true);
    loadCategories();
  };

  const closeCategoriesDialog = () => {
    setIsCategoriesOpen(false);
    setNewCategoryName('');
    setEditingCategoryId(null);
    setEditingCategoryName('');
  };

  const createCategory = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const res = await fetch(`${apiUrl}/event-categories`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategoryName }),
    });
    if (!res.ok) {
      handleDuplicateOrSaveError(res);
      return;
    }
    toast.saved();
    setNewCategoryName('');
    loadCategories();
  };

  const saveCategoryRename = async (id: string) => {
    if (!editingCategoryName.trim()) return;
    const res = await fetch(`${apiUrl}/event-categories/${id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingCategoryName }),
    });
    if (!res.ok) {
      handleDuplicateOrSaveError(res);
      return;
    }
    toast.saved();
    setEditingCategoryId(null);
    loadCategories();
  };

  const deleteCategory = async (category: EventCategory) => {
    if (!confirm(`Delete category "${category.name}"?`)) return;
    const res = await fetch(`${apiUrl}/event-categories/${category.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
    loadCategories();
  };

  const columns: AdminTableColumn<Event>[] = [
    { header: 'Title', render: (event) => event.title },
    { header: 'Status', render: (event) => <StatusBadge status={event.status} /> },
    {
      header: 'Start Date',
      render: (event) =>
        event.nearestSession ? formatSessionDate(event.nearestSession.startDateTime) : '—',
    },
    {
      header: 'End Date',
      render: (event) =>
        event.nearestSession ? formatSessionDate(event.nearestSession.endDateTime) : '—',
    },
    { header: 'Type', render: (event) => event.nearestSession?.sessionType ?? '—' },
    { header: 'Venue', render: (event) => event.nearestSession?.venue ?? '—' },
    { header: 'Sessions', render: (event) => event.sessions.length },
  ];

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateTitle('');
    setCreateDescription('');
    setCreateThumbnail('');
    setCreateCategories([]);
    setCreateError('');
  };

  const createEvent = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!createTitle.trim()) {
      setCreateError('Title is required');
      return;
    }
    setIsCreating(true);
    setCreateError('');
    const res = await fetch(`${apiUrl}/events`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: createTitle,
        description: createDescription || undefined,
        thumbnail: createThumbnail || undefined,
        categories: createCategories,
      }),
    });
    setIsCreating(false);
    if (!res.ok) {
      setCreateError('Failed to create event');
      return;
    }
    const event = await res.json();
    router.push(`/admin/events/${event.id}`);
  };

  return (
    <AdminLayout
      title="Events"
      backHref="/admin"
      actions={
        <>
          <Button variant="secondary" onClick={openCategoriesDialog}>
            Manage Categories
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} variant="gradient">
            New Event
          </Button>
        </>
      }
    >
      <AdminTable
        columns={columns}
        data={events}
        keyField="id"
        onRowClick={(event) => router.push(`/admin/events/${event.id}`)}
        emptyMessage={total === 0 && !debouncedSearch ? 'No events yet.' : 'No events match your search.'}
        pagination={{ page, pageSize, total, onPageChange: setPage }}
        toolbar={
          <div className="flex-1 min-w-50">
            <Input
              id="searchTitle"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by title..."
              value={search}
            />
          </div>
        }
      />

      <Dialog isOpen={isCategoriesOpen} onClose={closeCategoriesDialog} title="Event Categories">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {categories.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-4 py-3">
                {editingCategoryId === item.id ? (
                  <>
                    <input
                      autoFocus
                      className="flex-1 min-w-0 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="text-teal-600 hover:text-teal-800"
                      onClick={() => saveCategoryRename(item.id)}
                    >
                      <Icon name="check" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-700"
                      onClick={() => setEditingCategoryId(null)}
                    >
                      <Icon name="x" className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-400">{item._count.events} event(s)</p>
                    </div>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-700"
                      onClick={() => {
                        setEditingCategoryId(item.id);
                        setEditingCategoryName(item.name);
                      }}
                    >
                      <Icon name="edit" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => deleteCategory(item)}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
            {categories.length === 0 && <p className="px-4 py-6 text-center text-slate-400">No categories yet.</p>}
          </div>
          <form className="flex items-end gap-2" onSubmit={createCategory}>
            <div className="flex-1 min-w-0">
              <Input
                autoFocus
                id="newCategoryName"
                label="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </div>
      </Dialog>

      <Dialog isOpen={isCreateOpen} onClose={closeCreateDialog} title="New Event">
        <form className="space-y-5" onSubmit={createEvent} noValidate>
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
          <SearchableSelect
            id="createCategories"
            label="Categories"
            multiple
            onChange={setCreateCategories}
            options={categoryOptions}
            placeholder="No categories"
            value={createCategories}
          />
          {createError && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {createError}
            </Alert>
          )}
          <Button type="submit" isLoading={isCreating} loadingLabel="Creating...">
            Create Event
          </Button>
        </form>
      </Dialog>
    </AdminLayout>
  );
}
