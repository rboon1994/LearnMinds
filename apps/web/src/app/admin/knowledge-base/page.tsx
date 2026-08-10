'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteDialog, Dialog } from '@/components/ui/Dialog';
import { FeatureGate } from '@/components/ui/FeatureGate';
import { FileUpload } from '@/components/ui/FileUpload';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
};

type KnowledgeBaseFile = {
  id: string;
  fileName: string;
  sizeBytes: number;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
};

const emptyKbForm = { name: '', description: '' };

export default function AdminKnowledgeBasePage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [files, setFiles] = useState<KnowledgeBaseFile[]>([]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyKbForm);
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [deletingKb, setDeletingKb] = useState<KnowledgeBase | null>(null);
  const [deletingFile, setDeletingFile] = useState<KnowledgeBaseFile | null>(null);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);

  const selected = knowledgeBases.find((kb) => kb.id === selectedId) ?? null;

  const loadKnowledgeBases = () => {
    if (!localStorage.getItem('token')) return;
    fetch(`${apiUrl}/knowledge-bases`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: KnowledgeBase[]) => {
        setKnowledgeBases(res);
        setSelectedId((prev) => prev ?? res[0]?.id ?? null);
      })
      .catch(() => {});
  };

  const loadFiles = (kbId: string) => {
    fetch(`${apiUrl}/knowledge-bases/${kbId}/files`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setFiles)
      .catch(() => {});
  };

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/admin');
      return;
    }
    loadKnowledgeBases();
  }, [user, router]);

  useEffect(() => {
    if (selectedId) {
      loadFiles(selectedId);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFiles([]);
  }, [selectedId]);

  const openCreateDialog = () => {
    setIsCreateOpen(true);
    setCreateForm(emptyKbForm);
    setCreateError('');
  };

  const createKnowledgeBase = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      setCreateError('Name is required');
      return;
    }
    setIsCreating(true);
    setCreateError('');
    const res = await fetch(`${apiUrl}/knowledge-bases`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createForm.name,
        description: createForm.description || undefined,
      }),
    });
    setIsCreating(false);
    if (!res.ok) {
      setCreateError('Failed to create knowledge base');
      return;
    }
    const created: KnowledgeBase = await res.json();
    toast.saved();
    setIsCreateOpen(false);
    loadKnowledgeBases();
    setSelectedId(created.id);
  };

  const deleteKnowledgeBase = async () => {
    if (!deletingKb) return;
    const res = await fetch(`${apiUrl}/knowledge-bases/${deletingKb.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    setDeletingKb(null);
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
    if (selectedId === deletingKb.id) setSelectedId(null);
    loadKnowledgeBases();
  };

  const uploadFile = async (file: File) => {
    if (!selectedId) return;
    setUploadingFileName(file.name);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${apiUrl}/knowledge-bases/${selectedId}/files`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    setUploadingFileName(null);
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    loadFiles(selectedId);
  };

  const deleteFile = async () => {
    if (!selectedId || !deletingFile) return;
    const res = await fetch(`${apiUrl}/knowledge-bases/${selectedId}/files/${deletingFile.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    setDeletingFile(null);
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
    loadFiles(selectedId);
  };

  if (user && user.role !== 'SUPER_ADMIN') return null;

  return (
    <AdminLayout
      title="Knowledge Base"
      backHref="/admin"
      actions={
        <Button onClick={openCreateDialog} variant="gradient">
          New Knowledge Base
        </Button>
      }
    >
      <FeatureGate featureKey="knowledge-base-management">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {knowledgeBases.map((kb) => (
              <button
                key={kb.id}
                type="button"
                onClick={() => setSelectedId(kb.id)}
                className={`w-full flex items-start gap-2 px-4 py-3 text-left ${
                  kb.id === selectedId ? 'bg-teal-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-slate-900">{kb.name}</p>
                  {kb.description && <p className="truncate text-xs text-slate-400">{kb.description}</p>}
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  className="text-red-400 hover:text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingKb(kb);
                  }}
                >
                  <Icon name="trash" className="h-4 w-4" />
                </span>
              </button>
            ))}
            {knowledgeBases.length === 0 && (
              <p className="px-4 py-6 text-center text-slate-400">No knowledge bases yet.</p>
            )}
          </div>

          <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
            {selected ? (
              <>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">{selected.name}</h2>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4 max-h-96 overflow-y-auto">
                  {uploadingFileName && (
                    <div className="flex items-center px-4 py-3 opacity-60">
                      <Icon name="file" className="h-4 w-4 mr-3 text-slate-400 shrink-0 animate-pulse" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-slate-900">{uploadingFileName}</p>
                        <p className="text-xs text-slate-400">Uploading…</p>
                      </div>
                    </div>
                  )}
                  {files.map((file) => (
                    <div key={file.id} className="flex items-center px-4 py-3">
                      <Icon name="file" className="h-4 w-4 mr-3 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-slate-900">{file.fileName}</p>
                        <p className="text-xs text-slate-400">{formatSize(file.sizeBytes)}</p>
                      </div>
                      <StatusBadge status={file.status} />
                      <button
                        type="button"
                        className="ml-3 text-red-500 hover:text-red-700"
                        onClick={() => setDeletingFile(file)}
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {files.length === 0 && !uploadingFileName && (
                    <p className="px-4 py-6 text-center text-slate-400">No files yet.</p>
                  )}
                </div>
                <FileUpload
                  key={files.length}
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,.json,.html"
                  acceptLabel="PDF, Word, PowerPoint, TXT, MD, CSV, JSON, HTML · Max 15MB"
                  id="kbFile"
                  maxSizeBytes={15 * 1024 * 1024}
                  disabled={!!uploadingFileName}
                  onFilesSelected={([file]) => file && uploadFile(file)}
                />
              </>
            ) : (
              <p className="py-16 text-center text-slate-400">Select or create a knowledge base.</p>
            )}
          </div>
        </div>
      </FeatureGate>

      <Dialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New Knowledge Base">
        <form className="space-y-5" onSubmit={createKnowledgeBase} noValidate>
          <Input
            autoFocus
            id="kbName"
            label="Name"
            onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            required
            value={createForm.name}
          />
          <Textarea
            id="kbDescription"
            label="Description"
            onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            value={createForm.description}
          />
          {createError && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {createError}
            </Alert>
          )}
          <Button type="submit" isLoading={isCreating} loadingLabel="Creating...">
            Create Knowledge Base
          </Button>
        </form>
      </Dialog>

      <ConfirmDeleteDialog
        isOpen={deletingKb !== null}
        onClose={() => setDeletingKb(null)}
        onConfirm={deleteKnowledgeBase}
        title={`Delete "${deletingKb?.name ?? ''}"`}
        userEmail={user?.email ?? ''}
      />

      <ConfirmDeleteDialog
        isOpen={deletingFile !== null}
        onClose={() => setDeletingFile(null)}
        onConfirm={deleteFile}
        title={`Delete "${deletingFile?.fileName ?? ''}"`}
        userEmail={user?.email ?? ''}
      />
    </AdminLayout>
  );
}
