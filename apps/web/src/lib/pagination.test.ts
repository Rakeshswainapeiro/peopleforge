import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { pageCount, paginationLabels } from './pagination';

describe('pagination', () => {
  it('counts pages, at least one', () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(11, 10)).toBe(2);
  });

  it('labels the pager for the list it pages', () => {
    const labels = paginationLabels('dashboard', 2, 4, 'en', createTranslator('en'));
    expect(labels).toEqual({
      navigation: 'Request pages',
      pageOf: 'Page 2 of 4',
      first: 'First page',
      previous: 'Previous page',
      next: 'Next page',
      last: 'Last page',
    });
  });
});
