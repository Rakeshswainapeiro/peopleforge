import { describe, expect, it } from 'vitest';
import { businessDay } from './time.js';

describe('businessDay', () => {
  it('uses the Dubai calendar day (UTC+4), not UTC', () => {
    expect(businessDay(new Date('2026-11-30T19:59:59Z'))).toBe('2026-11-30');
    expect(businessDay(new Date('2026-11-30T20:00:00Z'))).toBe('2026-12-01');
  });
});
