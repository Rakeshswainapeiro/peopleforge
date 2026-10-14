import { describe, expect, it } from 'vitest';
import { attachmentDisposition } from './content-disposition.js';

describe('attachmentDisposition', () => {
  it('sends ASCII names as they are', () => {
    expect(attachmentDisposition('appraisal 2026.pdf')).toBe(
      `attachment; filename="appraisal 2026.pdf"; filename*=UTF-8''appraisal%202026.pdf`,
    );
  });

  it('keeps Arabic names exact in filename* with a safe fallback', () => {
    expect(attachmentDisposition('تقييم.pdf')).toBe(
      `attachment; filename="_____.pdf"; filename*=UTF-8''%D8%AA%D9%82%D9%8A%D9%8A%D9%85.pdf`,
    );
  });

  it('escapes characters that would end or confuse the header value', () => {
    expect(attachmentDisposition(`it's (final) 100%\\x*.pdf`)).toBe(
      `attachment; filename="it's (final) 100__x*.pdf"; filename*=UTF-8''it%27s%20%28final%29%20100%25%5Cx%2A.pdf`,
    );
  });
});
