'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteDialog } from '@/components/ui/Dialog';
import { FeatureGate } from '@/components/ui/FeatureGate';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

type Speaker = {
  id: string;
  name: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
};

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export default function EditSpeakerPage() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const speakerId = params.id;

  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = () => {
    fetch(`${apiUrl}/speakers/${speakerId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: Speaker) => {
        setSpeaker(data);
        setName(data.name);
        setTitle(data.title);
        setDescription(data.description ?? '');
        setThumbnail(data.thumbnail ?? '');
      })
      .catch(() => setError('Failed to load speaker'));
  };

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/admin');
      return;
    }
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, speakerId, router]);

  if (user && user.role !== 'SUPER_ADMIN') return null;
  if (!speaker) return null;

  const save = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch(`${apiUrl}/speakers/${speakerId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        title,
        description: description || null,
        thumbnail: thumbnail || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.saved();
    load();
  };

  const deleteSpeaker = async () => {
    const res = await fetch(`${apiUrl}/speakers/${speakerId}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
    router.push('/admin/speakers');
  };

  return (
    <AdminLayout
      title="Edit Speaker"
      backHref="/admin/speakers"
      subtitle={speaker.name}
      actions={
        <Button
          variant="danger"
          onClick={() => setConfirmDelete(true)}
          leftIcon={<Icon name="trash" className="h-4 w-4 mr-1.5" />}
        >
          Delete
        </Button>
      }
    >
      <FeatureGate featureKey="speaker-management">
        <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-5">
          <form className="space-y-5" onSubmit={save} noValidate>
            <Input id="name" label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input id="title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <Textarea
              id="description"
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
            <Input
              id="thumbnail"
              label="Thumbnail"
              value={thumbnail}
              onChange={(e) => setThumbnail(e.target.value)}
              placeholder="https://..."
            />
            {error && (
              <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
                {error}
              </Alert>
            )}
            <Button type="submit" isLoading={saving} loadingLabel="Saving...">
              Save
            </Button>
          </form>
        </div>

        <ConfirmDeleteDialog
          isOpen={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={deleteSpeaker}
          title="Delete Speaker"
          userEmail={user?.email ?? ''}
        />
      </FeatureGate>
    </AdminLayout>
  );
}
