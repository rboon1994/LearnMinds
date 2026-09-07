'use client';

import { useEffect, useState } from 'react';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { apiUrl } from '@/lib/api';
import { renderMarkdownLite } from '@/lib/renderMarkdownLite';

type Paginated<T> = { data: T[]; total: number; page: number; pageSize: number; totalPages: number };

type ConversationRow = {
  id: string;
  title: string | null;
  updatedAt: string;
  agent: { name: string };
  _count: { messages: number };
};

type MessageRow = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
};

type LessonViewRow = {
  id: string;
  viewCount: number;
  firstViewedAt: string;
  lastViewedAt: string;
  lesson: { id: string; title: string; course: { id: string; title: string } };
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

type UserActivityDialogProps = {
  userId: string;
  userLabel: string;
  isOpen: boolean;
  onClose: () => void;
};

export function UserActivityDialog({ userId, userLabel, isOpen, onClose }: UserActivityDialogProps) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="xl" title={`Activity — ${userLabel}`}>
      {/* key forces a full remount per user — cheap insurance in case a future revision lets an
          admin jump from one user's activity straight to another's without closing in between. */}
      <ActivityContent key={userId} userId={userId} />
    </Dialog>
  );
}

type Tab = 'chat' | 'courses' | 'membership';

function ActivityContent({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>('chat');
  // Tracks which tabs have ever been activated — each tab's content only mounts (and fetches)
  // the first time it becomes active, so opening the dialog never fires both tabs' requests at
  // once. Once mounted, a tab stays mounted (just hidden) so switching back doesn't refetch or
  // lose its own page position — and since each tab owns its own `page` state independently,
  // there's no shared pagination state that could leak a stale page number across tabs.
  const [everActivated, setEverActivated] = useState<Set<Tab>>(() => new Set(['chat']));

  const activate = (next: Tab) => {
    setTab(next);
    setEverActivated((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(['chat', 'courses', 'membership'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => activate(t)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
              tab === t
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t === 'chat' ? 'Chat History' : t === 'courses' ? 'Course Views' : 'Membership'}
          </button>
        ))}
      </div>
      {everActivated.has('chat') && (
        <div className={tab === 'chat' ? '' : 'hidden'}>
          <ChatHistoryTab userId={userId} />
        </div>
      )}
      {everActivated.has('courses') && (
        <div className={tab === 'courses' ? '' : 'hidden'}>
          <CourseViewsTab userId={userId} />
        </div>
      )}
      {everActivated.has('membership') && (
        <div className={tab === 'membership' ? '' : 'hidden'}>
          <MembershipTab userId={userId} />
        </div>
      )}
    </div>
  );
}

function ChatHistoryTab({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [conversations, setConversations] = useState<Paginated<ConversationRow>>(emptyPage);
  const [selected, setSelected] = useState<ConversationRow | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/agent-chat/admin/users/${userId}/conversations?page=${page}&pageSize=${PAGE_SIZE}`, {
      headers: authHeaders(),
    })
      .then((r) => r.json())
      .then(setConversations)
      .catch(() => {});
  }, [userId, page]);

  if (selected) {
    return <ConversationMessages userId={userId} conversation={selected} onBack={() => setSelected(null)} />;
  }

  const columns: AdminTableColumn<ConversationRow>[] = [
    { header: 'Agent', render: (row) => row.agent.name },
    // Same fallback convention as ai-chat/page.tsx: title stays null until the user manually
    // renames it, and the fallback shown is the agent's name, not a generic placeholder.
    { header: 'Title', render: (row) => row.title ?? row.agent.name },
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
  userId,
  conversation,
  onBack,
}: {
  userId: string;
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
      `${apiUrl}/agent-chat/admin/users/${userId}/conversations/${conversation.id}/messages?page=${targetPage}&pageSize=${PAGE_SIZE}`,
      { headers: authHeaders() },
    )
      .then((r) => r.json())
      .then((res: Paginated<MessageRow>) => {
        // The API returns each page newest-first (so "page 1" is the most recent messages) —
        // reverse to ascending before merging, and dedup by id, since a page fetched while
        // another insert lands concurrently could otherwise hand back an overlapping message.
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
            {/* Same convention as ai-chat/page.tsx: only ASSISTANT content is Markdown (users
                type plain text) — rendering it the same way here avoids leaking raw #/** syntax. */}
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

function CourseViewsTab({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [views, setViews] = useState<Paginated<LessonViewRow>>(emptyPage);

  useEffect(() => {
    fetch(`${apiUrl}/courses/admin/users/${userId}/lesson-views?page=${page}&pageSize=${PAGE_SIZE}`, {
      headers: authHeaders(),
    })
      .then((r) => r.json())
      .then(setViews)
      .catch(() => {});
  }, [userId, page]);

  const columns: AdminTableColumn<LessonViewRow>[] = [
    { header: 'Course', render: (row) => row.lesson.course.title },
    { header: 'Lesson', render: (row) => row.lesson.title },
    { header: 'Views', render: (row) => row.viewCount },
    { header: 'First Viewed', render: (row) => formatDateTime(row.firstViewedAt) },
    { header: 'Last Viewed', render: (row) => formatDateTime(row.lastViewedAt) },
  ];

  return (
    <AdminTable
      columns={columns}
      data={views.data}
      keyField="id"
      emptyMessage="No lessons viewed yet."
      pagination={{ page, pageSize: PAGE_SIZE, total: views.total, onPageChange: setPage }}
    />
  );
}

type MembershipRow = {
  id: string;
  tier: string;
  startDate: string;
  endDate: string;
  amount: number;
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
};

const MEMBERSHIP_STATUS_LABELS: Record<MembershipRow['status'], string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

function MembershipTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<MembershipRow[]>([]);

  useEffect(() => {
    fetch(`${apiUrl}/memberships/admin/users/${userId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setRows)
      .catch(() => {});
  }, [userId]);

  const columns: AdminTableColumn<MembershipRow>[] = [
    { header: 'Tier', render: (row) => row.tier },
    { header: 'Start', render: (row) => formatDateTime(row.startDate).split(',')[0] },
    { header: 'End', render: (row) => formatDateTime(row.endDate).split(',')[0] },
    { header: 'Amount', render: (row) => `RM ${row.amount.toFixed(2)}` },
    { header: 'Status', render: (row) => MEMBERSHIP_STATUS_LABELS[row.status] },
  ];

  return (
    <AdminTable
      columns={columns}
      data={rows}
      keyField="id"
      emptyMessage="No Membership history yet."
    />
  );
}
