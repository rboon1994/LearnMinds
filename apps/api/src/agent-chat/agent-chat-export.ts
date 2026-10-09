export type AgentChatExportRow = {
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: Date;
  conversation: {
    title: string | null;
    user: { fullName: string; email: string };
  };
};

const CSV_HEADER = [
  'User Name',
  'User Email',
  'Conversation Title',
  'Role',
  'Message',
  'Created At',
];

// CSV/formula-injection guard (OWASP): every field here is user-authored chat content, not
// operator-entered data, so a message starting with =/+/-/@ (or a leading tab/CR) must not reach
// the file as a live formula the moment an admin opens it in Excel/Sheets — e.g. a chat message
// of `=HYPERLINK("http://evil","click")` or `=cmd|'/C calc'!A0`. Prefixing with a single quote
// neutralizes formula interpretation while keeping the value's text intact and visible.
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

function neutralizeFormulaInjection(value: string): string {
  return value.length > 0 && FORMULA_TRIGGER_CHARS.has(value[0])
    ? `'${value}`
    : value;
}

// Only a comma/quote/newline forces quoting — RFC 4180's minimal rule, not "quote everything".
function escapeCsvField(value: string): string {
  const safe = neutralizeFormulaInjection(value);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

// BOM prefix + \r\n line endings — same "Excel on Windows reliably detects UTF-8" convention the
// bulk-enroll/students CSV templates already use (see downloadBulkEnrollTemplate/
// downloadBulkTemplate on the frontend), just produced server-side here instead of client-side.
export function buildAgentChatExportCsv(rows: AgentChatExportRow[]): string {
  const lines = rows.map((row) =>
    [
      row.conversation.user.fullName,
      row.conversation.user.email,
      row.conversation.title ?? '',
      row.role,
      row.content,
      row.createdAt.toISOString(),
    ]
      .map(escapeCsvField)
      .join(','),
  );
  return '﻿' + [CSV_HEADER.join(','), ...lines].join('\r\n');
}
