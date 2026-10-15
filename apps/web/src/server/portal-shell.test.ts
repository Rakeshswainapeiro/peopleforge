import { revalidatePath } from 'next/cache';
import { describe, expect, it, vi } from 'vitest';
import { refreshPortalShell } from './portal-shell';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe('refreshPortalShell', () => {
  it('re-renders the portal layout so the sidebar counts are current', () => {
    refreshPortalShell();
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });
});
