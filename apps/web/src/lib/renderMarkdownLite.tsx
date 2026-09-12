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

// Strips one leading/trailing '|' (Markdown table rows are often, but not always, fenced with
// them) then splits on the rest — works whether or not the model fences its rows.
function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

// The header-separator row (e.g. "| --- | :---: |") is what actually distinguishes a table from
// any other line that happens to contain a '|' — every cell is just dashes, optionally with a
// leading/trailing ':' for alignment, nothing else.
function isTableSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

// Headers (#/##/###), numbered sections ("1. Title"), and tables are realistic shapes even with
// the chat-formatting instruction in openai.service.ts — the model doesn't always follow it, so
// this still needs to render them cleanly (bold label, no visible #/number-list/pipe symbols) as
// a fallback, rather than leaking raw Markdown syntax into the chat bubble.
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

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // A table is a row containing '|' immediately followed by a separator row — that pairing is
    // what's actually distinctive; a bullet or sentence that happens to contain '|' never has a
    // dashes-only line right after it, so this doesn't misfire on ordinary text.
    if (line.includes('|') && isTableSeparatorRow(lines[i + 1] ?? '')) {
      flushList();
      const headerCells = splitTableRow(line);
      const bodyRows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        bodyRows.push(splitTableRow(lines[j]));
        j++;
      }
      blocks.push(
        <div key={`table-${i}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {headerCells.map((cell, ci) => (
                  <th
                    key={ci}
                    className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold"
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-slate-200 px-2 py-1 align-top">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      i = j;
      continue;
    }

    // A standalone thematic break (---/***/___ alone on a line, no '|' involved) — a common way
    // models divide a reply into sections. Distinct from the table separator above, which only
    // ever matches immediately after a '|'-containing row and is consumed as part of that table.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      blocks.push(<hr key={`hr-${i}`} className="border-slate-200" />);
      i++;
      continue;
    }

    const headingMatch = /^#{1,6}\s+(.*)/.exec(line);
    if (headingMatch) {
      flushList();
      blocks.push(
        <p key={`h-${i}`} className="text-base font-semibold text-slate-900">
          {renderInline(headingMatch[1])}
        </p>,
      );
      i++;
      continue;
    }
    const bulletMatch = /^[-*]\s+(.*)/.exec(line);
    if (bulletMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(bulletMatch[1]);
      i++;
      continue;
    }
    const orderedMatch = /^\d+[.)]\s+(.*)/.exec(line);
    if (orderedMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(orderedMatch[1]);
      i++;
      continue;
    }
    flushList();
    if (line.trim() !== '') {
      blocks.push(<p key={`p-${i}`}>{renderInline(line)}</p>);
    }
    i++;
  }
  flushList();
  // Tailwind's reset zeroes out <p>/<ul>/<ol> margins, so without this wrapper's own spacing,
  // every block renders flush against the next — the "all squished together" symptom.
  return <div className="space-y-2">{blocks}</div>;
}
