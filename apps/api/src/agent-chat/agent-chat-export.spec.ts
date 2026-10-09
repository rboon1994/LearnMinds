import { buildAgentChatExportCsv } from './agent-chat-export';

describe('buildAgentChatExportCsv', () => {
  it('writes a header row plus one row per message, with a UTF-8 BOM prefix', () => {
    const csv = buildAgentChatExportCsv([
      {
        role: 'USER',
        content: 'hello',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        conversation: {
          title: 'My Chat',
          user: { fullName: 'Jane Tan', email: 'jane@example.com' },
        },
      },
    ]);
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe('User Name,User Email,Conversation Title,Role,Message,Created At');
    expect(lines[1]).toBe(
      'Jane Tan,jane@example.com,My Chat,USER,hello,2026-01-01T00:00:00.000Z',
    );
  });

  it('falls back to an empty title for an unrenamed (null) conversation', () => {
    const csv = buildAgentChatExportCsv([
      {
        role: 'ASSISTANT',
        content: 'hi',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        conversation: { title: null, user: { fullName: 'Jane Tan', email: 'jane@example.com' } },
      },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('Jane Tan,jane@example.com,,ASSISTANT,hi,2026-01-01T00:00:00.000Z');
  });

  // The whole reason a hand-rolled CSV writer needs its own tests: every one of these characters
  // breaks a naive `.join(',')` if not quoted/escaped correctly.
  it('quotes a field containing a comma, wraps embedded quotes by doubling them, and preserves an embedded newline inside the quoted field', () => {
    const csv = buildAgentChatExportCsv([
      {
        role: 'USER',
        content: 'line one, with a comma\nline two with a "quote"',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        conversation: { title: null, user: { fullName: 'Jane Tan', email: 'jane@example.com' } },
      },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe(
      'Jane Tan,jane@example.com,,USER,"line one, with a comma\nline two with a ""quote""",2026-01-01T00:00:00.000Z',
    );
  });

  it('returns just the header row for an empty export', () => {
    const csv = buildAgentChatExportCsv([]);
    expect(csv).toBe('﻿User Name,User Email,Conversation Title,Role,Message,Created At');
  });

  // CSV/formula injection guard: message content is user-authored, not operator-entered, so a
  // leading =/+/-/@ must never reach the file as a live formula in Excel/Sheets.
  it.each(['=cmd|\'/C calc\'!A0', '+1+1', '-1+1', '@SUM(A1:A2)'])(
    'neutralizes a message starting with a formula-trigger character (%s) by prefixing a single quote',
    (maliciousContent) => {
      const csv = buildAgentChatExportCsv([
        {
          role: 'USER',
          content: maliciousContent,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          conversation: { title: null, user: { fullName: 'Jane Tan', email: 'jane@example.com' } },
        },
      ]);
      const lines = csv.split('\r\n');
      expect(lines[1]).toBe(
        `Jane Tan,jane@example.com,,USER,'${maliciousContent},2026-01-01T00:00:00.000Z`,
      );
    },
  );

  it('also neutralizes a formula-trigger character in the conversation title and user name fields', () => {
    const csv = buildAgentChatExportCsv([
      {
        role: 'USER',
        content: 'hello',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        conversation: {
          title: '=HYPERLINK("http://evil.example","click")',
          user: { fullName: '=1+1', email: 'jane@example.com' },
        },
      },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe(
      '\'=1+1,jane@example.com,"\'=HYPERLINK(""http://evil.example"",""click"")",USER,hello,2026-01-01T00:00:00.000Z',
    );
  });

  it('does not touch a value that merely contains (but does not start with) a formula-trigger character', () => {
    const csv = buildAgentChatExportCsv([
      {
        role: 'USER',
        content: 'the total is a+b=c',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        conversation: { title: null, user: { fullName: 'Jane Tan', email: 'jane@example.com' } },
      },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe(
      'Jane Tan,jane@example.com,,USER,the total is a+b=c,2026-01-01T00:00:00.000Z',
    );
  });
});
