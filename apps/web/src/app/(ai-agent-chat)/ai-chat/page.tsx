'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navigation } from '@/components/layout/Navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// Minimal inline formatting for the realistic shapes a file_search-grounded answer returns
// (bold/italic/inline code/lists) — no new dependency for a handful of regex passes.
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`'))
      parts.push(
        <code key={key++} className="rounded bg-slate-100 px-1 py-0.5 text-xs">
          {token.slice(1, -1)}
        </code>,
      );
    else parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function renderMarkdownLite(text: string): ReactNode {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-0.5">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };
  lines.forEach((line, idx) => {
    const listMatch = /^[-*]\s+(.*)/.exec(line);
    if (listMatch) {
      listBuffer.push(listMatch[1]);
      return;
    }
    flushList();
    if (line.trim() === '') return;
    blocks.push(<p key={`p-${idx}`}>{renderInline(line)}</p>);
  });
  flushList();
  return blocks;
}

type Conversation = {
  id: string;
  title: string | null;
  agent: { id: string; name: string; thumbnail: string | null; instructions: string | null };
  lastMessage: { content: string; role: 'USER' | 'ASSISTANT' } | null;
  updatedAt: string;
};

type Message = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
};

export default function AiChatPage() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('conversationId');

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<'row' | 'header' | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const navUserName = user?.fullName ?? '';
  const navUser = { name: navUserName, initials: initials(navUserName), role: user?.role ?? '' };

  // The active conversation is excluded from the backend's empty-thread cleanup, so a chat the
  // user just started (no messages yet) survives while they're on it — see agent-chat.service.ts.
  const loadConversations = () => {
    const params = conversationId ? `?activeConversationId=${conversationId}` : '';
    fetch(`${apiUrl}/agent-chat/conversations${params}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setConversations)
      .catch(() => {});
  };

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      return;
    }
    fetch(`${apiUrl}/agent-chat/conversations/${conversationId}/messages`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setMessages)
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || !conversationId || isSending) return;
    setIsSending(true);
    setInput('');
    const res = await fetch(`${apiUrl}/agent-chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    setIsSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      // NestJS's ValidationPipe returns `message` as a string[], not a string — join it so
      // toast.warning always receives the string its type expects.
      const message = Array.isArray(data?.message)
        ? data.message.join(', ')
        : data?.message ?? 'Failed to send message';
      toast.warning(message);
      setInput(content);
      return;
    }
    const { userMessage, assistantMessage }: { userMessage: Message; assistantMessage: Message } =
      await res.json();
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    loadConversations();
  };

  const activeConversation = conversations.find((c) => c.id === conversationId) ?? null;

  // A conversation can be both the active header AND a row in the list at the same time —
  // editingSource picks which one actually renders the <input>, so the two never both mount at
  // once (two autoFocus inputs fighting over focus would blur the first immediately, resetting
  // editingId before the user could type anything).
  const startEditing = (c: Conversation, source: 'row' | 'header') => {
    setEditingId(c.id);
    setEditingSource(source);
    setEditingTitle(c.title ?? c.agent.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingSource(null);
  };

  // Blank clears the custom name (falls back to the agent's name) rather than being rejected.
  const saveTitle = async () => {
    if (!editingId) return;
    const id = editingId;
    const title = editingTitle;
    cancelEditing();
    const res = await fetch(`${apiUrl}/agent-chat/conversations/${id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return;
    const updated: { title: string | null } = await res.json();
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c)));
  };

  return (
    <div className="h-screen bg-slate-50 flex">
      <Navigation user={navUser} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 min-w-0 flex">
        {/* Left — chat history. On mobile this is the only pane shown until a chat is opened —
            selecting one switches to the message thread below, same as WhatsApp's list/thread
            screens; sm: and up always shows both side by side. */}
        <div
          className={`${conversationId ? 'hidden sm:flex' : 'flex'} w-full sm:w-80 shrink-0 border-r border-slate-200 bg-white flex-col`}
        >
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <h1 className="text-lg font-bold text-slate-900">AI Chat</h1>
            <button
              type="button"
              className="lg:hidden p-2 -mr-1 rounded-lg text-slate-600 hover:bg-slate-100"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Icon name="list" className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => editingId !== c.id && router.push(`/ai-chat?conversationId=${c.id}`)}
                className={`group flex cursor-pointer items-center gap-3 px-4 py-3 text-left ${
                  c.id === conversationId ? 'bg-teal-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center shrink-0 overflow-hidden">
                  {c.agent.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.agent.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Icon name="robot" className="w-5 h-5 text-violet-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {editingId === c.id && editingSource === 'row' ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={saveTitle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); saveTitle(); }
                        if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); }
                      }}
                      className="w-full rounded border border-teal-400 px-1 py-0.5 text-sm font-medium text-slate-900 focus:outline-none"
                    />
                  ) : (
                    <p className="truncate font-medium text-slate-900">{c.title ?? c.agent.name}</p>
                  )}
                  <p className="truncate text-xs text-slate-400">
                    {c.lastMessage ? c.lastMessage.content : 'No messages yet'}
                  </p>
                </div>
                {!(editingId === c.id && editingSource === 'row') && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditing(c, 'row');
                    }}
                    className="shrink-0 text-slate-400 opacity-0 hover:text-slate-700 group-hover:opacity-100"
                  >
                    <Icon name="edit" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="px-4 py-6 text-center text-slate-400">No chats yet.</p>
            )}
          </div>
        </div>

        {/* Right — message thread. Shown only on mobile once a chat is open (see the pane above);
            always shown on sm: and up. */}
        <div className={`${conversationId ? 'flex' : 'hidden'} sm:flex flex-1 min-w-0 flex-col`}>
          {activeConversation ? (
            <>
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => router.push('/ai-chat')}
                  className="sm:hidden -ml-1 p-1 text-slate-500 hover:text-slate-700"
                >
                  <Icon name="arrow-left" className="w-5 h-5" />
                </button>
                <div className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center shrink-0 overflow-hidden">
                  {activeConversation.agent.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activeConversation.agent.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Icon name="robot" className="w-4 h-4 text-violet-600" />
                  )}
                </div>
                {editingId === activeConversation.id && editingSource === 'header' ? (
                  <input
                    autoFocus
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); saveTitle(); }
                      if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); }
                    }}
                    className="flex-1 rounded border border-teal-400 px-2 py-1 text-sm font-semibold text-slate-900 focus:outline-none"
                  />
                ) : (
                  <>
                    <h2 className="font-semibold text-slate-900">
                      {activeConversation.title ?? activeConversation.agent.name}
                    </h2>
                    <button
                      type="button"
                      onClick={() => startEditing(activeConversation, 'header')}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <Icon name="edit" className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>

              {activeConversation.agent.instructions && (
                <div className="flex items-start gap-2 border-b border-teal-100 bg-teal-50 px-5 py-3 text-sm text-teal-900">
                  <Icon name="info" className="h-4 w-4 mt-0.5 shrink-0 text-teal-600" />
                  <p>{activeConversation.agent.instructions}</p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-lg rounded-2xl px-4 py-2 text-sm ${
                        m.role === 'USER' ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-900'
                      }`}
                    >
                      {m.role === 'ASSISTANT' ? renderMarkdownLite(m.content) : m.content}
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex justify-start">
                    <div className="max-w-lg rounded-2xl px-4 py-2 text-sm bg-white border border-slate-200 text-slate-400">
                      Typing…
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
                <div className="flex-1">
                  <Textarea
                    id="chatInput"
                    rows={1}
                    placeholder="Type a message..."
                    value={input}
                    disabled={isSending}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                </div>
                <Button onClick={sendMessage} disabled={isSending || !input.trim()} isLoading={isSending}>
                  Send
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
              <p>Select a chat or start a new one.</p>
              <Button href="/agents">Browse Agents</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
