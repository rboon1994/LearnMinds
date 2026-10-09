import { buildContentDispositionHeader } from './content-disposition';

describe('buildContentDispositionHeader', () => {
  it('provides both an ASCII-safe fallback and the RFC 5987 extended form for a CJK filename', () => {
    const header = buildContentDispositionHeader(
      'attachment',
      '季度销售报告.xlsx',
    );
    expect(header).toBe(
      'attachment; filename="______.xlsx"; filename*=UTF-8\'\'%E5%AD%A3%E5%BA%A6%E9%94%80%E5%94%AE%E6%8A%A5%E5%91%8A.xlsx',
    );
  });

  it('leaves a plain ASCII filename unchanged in both forms', () => {
    const header = buildContentDispositionHeader('inline', 'report.pdf');
    expect(header).toBe(
      'inline; filename="report.pdf"; filename*=UTF-8\'\'report.pdf',
    );
  });
});
