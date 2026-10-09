'use client';

import { useEffect, useState } from 'react';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { apiUrl } from '@/lib/api';
import { renderMarkdownLite } from '@/lib/renderMarkdownLite';

type Paginated<T> = { data: T[]; total: number; page: number; pageSize: number; totalPages: number };

// Same shape as UserActivityDialog's ConversationRow, but `user` in place of `agent` — the agent
// is fixed by the dialog itself, so the row's other party is who used it.
type ConversationRow = {
  id: string;
  title: string | null;
  updatedAt: string;
  user: { id: string; fullName: string; email: string };
  _count: { messages: number };
};

type MessageRow = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
};

const PAGE_SIZE = 10;

function emptyPage<T>(): Paginated<T> {
  return { data: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 };
}

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString();
}

// Fetched as a blob (not a plain <a href>) so the Authorization header reaches the export route —
// same rationale as downloadBlob in learn/[courseId]/page.tsx.
async function exportChatHistory(agentId: string, agentLabel: string) {
  const res = await fetch(`${apiUrl}/agent-chat/admin/agents/${agentId}/conversations/export`, {
    headers: authHeaders(),
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `${agentLabel}-chat-export.csv`;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

type AgentChatHistoryDialogProps = {
  agentId: string;
  agentLabel: string;
  isOpen: boolean;
  onClose: () => void;
};

export function AgentChatHistoryDialog({ agentId, agentLabel, isOpen, onClose }: AgentChatHistoryDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={`Chat History — ${agentLabel}`}
      titleExtra={
        <button
          type="button"
          onClick={() => exportChatHistory(agentId, agentLabel)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
        >
          <Icon name="download" className="h-3.5 w-3.5" />
          Export
        </button>
      }
    >
      {/* key forces a full remount per agent, same insurance as UserActivityDialog. */}
      <ConversationsList key={agentId} agentId={agentId} />
    </Dialog>
  );
}

function ConversationsList({ agentId }: { agentId: string }) {
  const [page, setPage] = useState(1);
  const [conversations, setConversations] = useState<Paginated<ConversationRow>>(emptyPage);
  const [selected, setSelected] = useState<ConversationRow | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/agent-chat/admin/agents/${agentId}/conversations?page=${page}&pageSize=${PAGE_SIZE}`, {
      headers: authHeaders(),
    })
      .then((r) => r.json())
      .then(setConversations)
      .catch(() => {});
  }, [agentId, page]);

  if (selected) {
    return <ConversationMessages agentId={agentId} conversation={selected} onBack={() => setSelected(null)} />;
  }

  const columns: AdminTableColumn<ConversationRow>[] = [
    { header: 'User', render: (row) => row.user.fullName },
    // Same fallback convention as ai-chat/page.tsx: title stays null until the user manually
    // renames it, and the fallback shown is the agent's name — here that's the dialog title, so
    // "Untitled" reads clearer than repeating it per row.
    { header: 'Title', render: (row) => row.title ?? 'Untitled' },
    { header: 'Messages', render: (row) => row._count.messages },
    { header: 'Last Updated', render: (row) => formatDateTime(row.updatedAt) },
  ];

  return (
    <AdminTable
      columns={columns}
      data={conversations.data}
      keyField="id"
      onRowClick={setSelected}
      emptyMessage="No chat history yet."
      pagination={{ page, pageSize: PAGE_SIZE, total: conversations.total, onPageChange: setPage }}
    />
  );
}

function ConversationMessages({
  agentId,
  conversation,
  onBack,
}: {
  agentId: string;
  conversation: ConversationRow;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const loadPage = (targetPage: number) => {
    setLoading(true);
    fetch(
      `${apiUrl}/agent-chat/admin/agents/${agentId}/conversations/${conversation.id}/messages?page=${targetPage}&pageSize=${PAGE_SIZE}`,
      { headers: authHeaders() },
    )
      .then((r) => r.json())
      .then((res: Paginated<MessageRow>) => {
        // Same page-1-is-newest / reverse-and-dedup handling as UserActivityDialog.
        const ascendingPage = [...res.data].reverse();
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...ascendingPage.filter((m) => !seen.has(m.id)), ...prev];
        });
        setTotalPages(res.totalPages);
        setPage(targetPage);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only the newest page on mount, loadPage itself isn't a stable dependency
  }, [conversation.id]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <Icon name="arrow-left" className="h-4 w-4" /> Back to conversations
      </button>
      <p className="mb-3 text-sm text-slate-500">
        {conversation.user.fullName} <span className="text-slate-400">({conversation.user.email})</span>
      </p>
      {page < totalPages && (
        <button
          type="button"
          onClick={() => loadPage(page + 1)}
          disabled={loading}
          className="mb-3 w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load older messages'}
        </button>
      )}
      <div className="max-h-96 space-y-3 overflow-y-auto">
        {messages.length === 0 && !loading && (
          <p className="py-8 text-center text-slate-400">No messages in this conversation.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
              m.role === 'USER' ? 'ml-auto bg-teal-50 text-slate-900' : 'bg-slate-100 text-slate-700'
            }`}
          >
            <p className="mb-1 text-xs font-medium text-slate-400">{m.role === 'USER' ? 'User' : 'Assistant'}</p>
            {m.role === 'ASSISTANT' ? (
              renderMarkdownLite(m.content)
            ) : (
              <p className="whitespace-pre-wrap">{m.content}</p>
            )}
            <p className="mt-1 text-xs text-slate-400">{formatDateTime(m.createdAt)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
