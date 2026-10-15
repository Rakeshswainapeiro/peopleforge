import { revalidatePath } from 'next/cache';

/**
 * Re-render the portal layout on the next response. The layout (sidebar, unread bell) is kept
 * across navigations, so a Server Action that changes what it shows — reading notifications,
 * submitting a request — calls this before redirecting, or the bell keeps a stale count.
 */
export function refreshPortalShell(): void {
  revalidatePath('/', 'layout');
}
