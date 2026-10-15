import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { statusBadge } from './request-status';

describe('statusBadge', () => {
  it('gives each status its Figma pill and its words', () => {
    const t = createTranslator('en');
    expect(statusBadge('draft', t)).toEqual({ tone: 'outline', label: 'Draft' });
    expect(statusBadge('submitted', t)).toEqual({ tone: 'neutral', label: 'Submitted' });
  });
});
