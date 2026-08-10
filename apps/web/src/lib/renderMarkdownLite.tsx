import type { ReactNode } from 'react';

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

// Headers (#/##/###) and numbered sections ("1. Title") are realistic shapes even with the
// chat-formatting instruction in openai.service.ts — the model doesn't always follow it, so this
// still needs to render them cleanly (bold label, no visible #/number-list symbols) as a fallback,
// rather than leaking raw Markdown syntax into the chat bubble.
//
// Shared between ai-chat/page.tsx (live chat) and UserActivityDialog.tsx (admin's read-only view
// of another user's chat history) — both render the same ASSISTANT message content the same way.
export function renderMarkdownLite(text: string): ReactNode {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listItems.length === 0) return;
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    blocks.push(
      <Tag
        key={`list-${blocks.length}`}
        className={`pl-5 space-y-0.5 ${listType === 'ol' ? 'list-decimal' : 'list-disc'}`}
      >
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </Tag>,
    );
    listItems = [];
    listType = null;
  };

  lines.forEach((line, idx) => {
    const headingMatch = /^#{1,6}\s+(.*)/.exec(line);
    if (headingMatch) {
      flushList();
      blocks.push(
        <p key={`h-${idx}`} className="text-base font-semibold text-slate-900">
          {renderInline(headingMatch[1])}
        </p>,
      );
      return;
    }
    const bulletMatch = /^[-*]\s+(.*)/.exec(line);
    if (bulletMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(bulletMatch[1]);
      return;
    }
    const orderedMatch = /^\d+[.)]\s+(.*)/.exec(line);
    if (orderedMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(orderedMatch[1]);
      return;
    }
    flushList();
    if (line.trim() === '') return;
    blocks.push(<p key={`p-${idx}`}>{renderInline(line)}</p>);
  });
  flushList();
  // Tailwind's reset zeroes out <p>/<ul>/<ol> margins, so without this wrapper's own spacing,
  // every block renders flush against the next — the "all squished together" symptom.
  return <div className="space-y-2">{blocks}</div>;
}
