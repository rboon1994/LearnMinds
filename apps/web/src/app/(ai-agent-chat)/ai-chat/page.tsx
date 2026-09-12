'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navigation } from '@/components/layout/Navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { renderMarkdownLite } from '@/lib/renderMarkdownLite';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function extOf(fileName: string) {
  const i = fileName.lastIndexOf('.');
  return i === -1 ? '' : fileName.slice(i).toLowerCase();
}

// Mirrors the backend's allowlists/limits in agent-chat.service.ts — kept in sync by hand, same
// as every other Multer fileFilter in this app (no shared source between client and server).
// .csv/.xlsx/.xls are converted to text server-side before OpenAI ever sees them (its
// vector-store attach endpoint otherwise rejects all three); legacy .ppt is excluded outright —
// only .pptx is supported, no server-side conversion exists for it.
const ALLOWED_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.pptx',
  '.txt',
  '.md',
  '.json',
  '.html',
  '.csv',
  '.xlsx',
  '.xls',
];
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const MAX_DOCUMENTS_PER_MESSAGE = 5;
const MAX_IMAGES_PER_MESSAGE = 5;
const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

// Attachments are opened as blobs (not a plain <a>/<img src>) so the Authorization header this
// app relies on everywhere can actually reach the download route — same rationale as the
// course-file/video download helpers elsewhere in the app.
async function viewAttachment(id: string) {
  const res = await fetch(`${apiUrl}/agent-chat/attachments/${id}/download`, { headers: authHeaders() });
  if (!res.ok) return;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank');
  // Revoke after a delay rather than immediately — the new tab needs time to load the blob
  // before its URL is invalidated, so we can't free it the instant window.open returns.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

type Conversation = {
  id: string;
  title: string | null;
  agent: { id: string; name: string; thumbnail: string | null; instructions: string | null };
  hasAccess: boolean;
  lastMessage: { content: string; role: 'USER' | 'ASSISTANT' } | null;
  updatedAt: string;
};

type Attachment = {
  id: string;
  type: 'DOCUMENT' | 'IMAGE';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type Message = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  attachments: Attachment[];
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
  const [stagedDocuments, setStagedDocuments] = useState<File[]>([]);
  const [stagedImages, setStagedImages] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<'row' | 'header' | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  // Only ever one in-flight send at a time (gated by isSending), so a single piece of state is
  // enough — starts as 'uploading' when the message has attachments (network upload + OpenAI
  // file/vector-store sync all happen before generation can start), flips to 'thinking' once the
  // backend confirms that's done, same label as a plain text-only message shows from the start.
  const [assistantPhase, setAssistantPhase] = useState<'uploading' | 'thinking'>('thinking');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Keyed by message id, pointing at the div renderMarkdownLite renders into — copyMessage reads
  // its actual rendered HTML/innerText, so the clipboard payload is exactly what's on screen
  // (bold/lists preserved) rather than a second markdown-to-string conversion kept in sync by hand.
  const contentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const setContentRef = (id: string, el: HTMLDivElement | null) => {
    if (el) contentRefs.current.set(id, el);
    else contentRefs.current.delete(id);
  };

  // Writes both text/html and text/plain to the clipboard — pasting into a rich editor keeps
  // bold/lists, pasting into plain text strips them, same as Claude/ChatGPT's copy button.
  // navigator.clipboard.write/ClipboardItem isn't supported in every browser (notably older
  // Firefox), so it falls back to plain-text-only writeText rather than doing nothing.
  const copyMessage = async (messageId: string) => {
    const node = contentRefs.current.get(messageId);
    if (!node) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([node.innerHTML], { type: 'text/html' }),
          'text/plain': new Blob([node.innerText], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      try {
        await navigator.clipboard.writeText(node.innerText);
      } catch {
        return;
      }
    }
    setCopiedMessageId(messageId);
    setTimeout(() => setCopiedMessageId((prev) => (prev === messageId ? null : prev)), 1500);
  };

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

  // Classifies each picked file as document/image by extension, rejects unsupported types and
  // anything over the per-type size cap, and trims to the per-type count cap — mirrors the
  // limits agent-chat.service.ts enforces server-side, purely for immediate user feedback (the
  // server is still the real authority).
  const stageFiles = (fileList: FileList) => {
    const newDocuments: File[] = [];
    const newImages: File[] = [];
    Array.from(fileList).forEach((file) => {
      const ext = extOf(file.name);
      if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          toast.warning(`"${file.name}" exceeds the ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB image limit`);
          return;
        }
        newImages.push(file);
      } else if (ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)) {
        if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
          toast.warning(`"${file.name}" exceeds the ${MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024)}MB document limit`);
          return;
        }
        newDocuments.push(file);
      } else {
        toast.warning(`"${file.name}" is not a supported file type`);
      }
    });
    setStagedDocuments((prev) => {
      const combined = [...prev, ...newDocuments];
      if (combined.length > MAX_DOCUMENTS_PER_MESSAGE) {
        toast.warning(`Only up to ${MAX_DOCUMENTS_PER_MESSAGE} documents per message`);
      }
      return combined.slice(0, MAX_DOCUMENTS_PER_MESSAGE);
    });
    setStagedImages((prev) => {
      const combined = [...prev, ...newImages];
      if (combined.length > MAX_IMAGES_PER_MESSAGE) {
        toast.warning(`Only up to ${MAX_IMAGES_PER_MESSAGE} images per message`);
      }
      return combined.slice(0, MAX_IMAGES_PER_MESSAGE);
    });
  };

  const removeStagedDocument = (index: number) => {
    setStagedDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  const removeStagedImage = (index: number) => {
    setStagedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async () => {
    const content = input.trim();
    const hasAttachments = stagedDocuments.length > 0 || stagedImages.length > 0;
    if ((!content && !hasAttachments) || !conversationId || isSending) return;
    setIsSending(true);
    setInput('');
    const documents = stagedDocuments;
    const images = stagedImages;
    setStagedDocuments([]);
    setStagedImages([]);
    // Show the user's own message the moment they hit send, not after the round trip — the
    // temp id is only ever used locally, replaced with the real one once the server responds.
    // Attachment chips can't be opened yet (no real id until the server responds), the render
    // below disables them for any message whose id still has the temp- prefix. The assistant
    // placeholder starts with empty content and is rendered as "Thinking…" until the first
    // delta arrives, then fills in bubble-by-bubble as the stream continues.
    const tempUserId = `temp-user-${Date.now()}`;
    const tempAssistantId = `temp-assistant-${Date.now()}`;
    setAssistantPhase(hasAttachments ? 'uploading' : 'thinking');
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        role: 'USER',
        content,
        createdAt: new Date().toISOString(),
        attachments: [...documents, ...images].map((file, i) => ({
          id: `${tempUserId}-${i}`,
          type: ALLOWED_IMAGE_EXTENSIONS.includes(extOf(file.name)) ? ('IMAGE' as const) : ('DOCUMENT' as const),
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        })),
      },
      { id: tempAssistantId, role: 'ASSISTANT', content: '', createdAt: new Date().toISOString(), attachments: [] },
    ]);

    const restoreOnFailure = () => {
      setMessages((prev) => prev.filter((m) => m.id !== tempUserId && m.id !== tempAssistantId));
      setInput(content);
      setStagedDocuments(documents);
      setStagedImages(images);
    };

    const formData = new FormData();
    formData.append('content', content);
    documents.forEach((file) => formData.append('documents', file));
    images.forEach((file) => formData.append('images', file));

    try {
      const res = await fetch(`${apiUrl}/agent-chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      let doneEvent: { userMessage: Message; assistantMessage: Message } | null = null;
      let errorMessage: string | null = null;
      if (!res.ok) {
        // A failure that never reached the controller's own ndjson wrapping — e.g. multer's
        // fileFilter rejecting the file before the handler body even runs — comes back as a
        // plain Nest exception body, not a streamed {type:'error'} line.
        const body = await res.json().catch(() => null);
        errorMessage = Array.isArray(body?.message)
          ? body.message.join(', ')
          : body?.message ?? 'Failed to send message';
      } else {
        const reader = res.body?.getReader();
        if (!reader) throw new Error('Streaming is not supported by this browser');
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === 'status' && event.phase === 'thinking') {
              setAssistantPhase('thinking');
            } else if (event.type === 'delta') {
              setMessages((prev) =>
                prev.map((m) => (m.id === tempAssistantId ? { ...m, content: m.content + event.text } : m)),
              );
            } else if (event.type === 'done') {
              doneEvent = event;
            } else if (event.type === 'error') {
              // NestJS exceptions carry `message` as a string, except class-validator's, which is
              // a string[] — join it so toast.warning always receives the string it expects.
              errorMessage = Array.isArray(event.message) ? event.message.join(', ') : event.message;
            }
          }
        }
      }
      setIsSending(false);
      if (errorMessage) {
        restoreOnFailure();
        toast.warning(errorMessage);
        // Covers access being revoked (or expiring) while this chat window was already open with
        // the send box visible — refetching refreshes hasAccess so the UI degrades to the
        // read-only notice right away instead of staying stuck showing a send box that will just
        // 403 again on the next attempt.
        loadConversations();
        return;
      }
      if (doneEvent) {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserId && m.id !== tempAssistantId),
          doneEvent.userMessage,
          doneEvent.assistantMessage,
        ]);
        loadConversations();
      }
    } catch {
      setIsSending(false);
      restoreOnFailure();
      toast.warning('Failed to send message');
    }
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
                {messages.map((m) => {
                  const isStreamingPlaceholder = m.id.startsWith('temp-assistant-');
                  const canCopy = m.role === 'ASSISTANT' && !isStreamingPlaceholder && !!m.content;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${m.role === 'USER' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-lg rounded-2xl px-4 py-2 text-sm ${
                          m.role === 'USER' ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-900'
                        }`}
                      >
                        {m.content ? (
                          m.role === 'ASSISTANT' ? (
                            <div ref={(el) => setContentRef(m.id, el)}>{renderMarkdownLite(m.content)}</div>
                          ) : (
                            // whitespace-pre-wrap: a plain string node ignores \n by default
                            // (browsers collapse it to a space) — this is the raw Shift+Enter
                            // input, not run through renderMarkdownLite's own line-splitting.
                            <span className="whitespace-pre-wrap">{m.content}</span>
                          )
                        ) : (
                          isStreamingPlaceholder && (
                            <span className="text-slate-400">
                              {assistantPhase === 'uploading' ? 'Uploading…' : 'Thinking…'}
                            </span>
                          )
                        )}
                        {m.attachments.length > 0 && (
                          <div className={`flex flex-wrap gap-1.5 ${m.content ? 'mt-2' : ''}`}>
                            {m.attachments.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                disabled={m.id.startsWith('temp-')}
                                onClick={() => viewAttachment(a.id)}
                                title={a.fileName}
                                className={`flex max-w-40 items-center gap-1.5 rounded-lg px-2 py-1 text-xs disabled:opacity-70 ${
                                  m.role === 'USER'
                                    ? 'bg-teal-700/40 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                <Icon name={a.type === 'IMAGE' ? 'eye' : 'file'} className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{a.fileName}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {canCopy && (
                        <button
                          type="button"
                          onClick={() => copyMessage(m.id)}
                          title="Copy"
                          className="mt-1 p-1 text-slate-400 hover:text-slate-700"
                        >
                          <Icon name={copiedMessageId === m.id ? 'check' : 'copy'} className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {!activeConversation.hasAccess && (
                <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-500">
                  Your access to this agent has expired — you can still view this conversation but can&apos;t send new messages.
                </div>
              )}
              {activeConversation.hasAccess && (
              <div className="border-t border-slate-200 bg-white p-3">
                {(stagedDocuments.length > 0 || stagedImages.length > 0) && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {stagedDocuments.map((file, i) => (
                      <span
                        key={`doc-${i}`}
                        className="flex max-w-40 items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700"
                      >
                        <Icon name="file" className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{file.name}</span>
                        <button type="button" onClick={() => removeStagedDocument(i)} className="shrink-0 text-slate-400 hover:text-slate-700">
                          <Icon name="x" className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {stagedImages.map((file, i) => (
                      <span
                        key={`img-${i}`}
                        className="flex max-w-40 items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700"
                      >
                        <Icon name="eye" className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{file.name}</span>
                        <button type="button" onClick={() => removeStagedImage(i)} className="shrink-0 text-slate-400 hover:text-slate-700">
                          <Icon name="x" className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    accept={[...ALLOWED_DOCUMENT_EXTENSIONS, ...ALLOWED_IMAGE_EXTENSIONS].join(',')}
                    onChange={(e) => {
                      if (e.target.files?.length) stageFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => fileInputRef.current?.click()}
                    className="mb-2 shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                    title="Attach file or image"
                  >
                    <Icon name="paper-clip" className="h-5 w-5" />
                  </button>
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
                  <Button
                    onClick={sendMessage}
                    disabled={isSending || (!input.trim() && stagedDocuments.length === 0 && stagedImages.length === 0)}
                    isLoading={isSending}
                  >
                    Send
                  </Button>
                </div>
              </div>
              )}
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
