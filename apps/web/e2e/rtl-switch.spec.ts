import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './support/sign-in';

/** Horizontal centre of an element as a fraction of the viewport width. */
async function centre(page: Page, locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  const width = page.viewportSize()?.width ?? 1;
  return ((box?.x ?? 0) + (box?.width ?? 0) / 2) / width;
}

// Internal i18n standard (ADR-001): demonstrate an en ↔ ar switch with a mirrored layout.
test.describe('language and direction switch', () => {
  test('switches the portal to Arabic, right-to-left, and back', async ({ page }) => {
    await signIn(page, 'reviewer');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(html).toHaveAttribute('dir', 'ltr');

    // The avatar sits at the start of the user block: left in English.
    const avatar = page.getByTestId('avatar');
    await expect(avatar).toBeVisible();
    expect(await centre(page, avatar)).toBeLessThan(0.5);

    await page.getByRole('button', { name: 'Switch language to العربية' }).click();

    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(html).toHaveAttribute('dir', 'rtl');
    // Translated text shows in Arabic; untranslated text falls back to English (Arabic content
    // is scaffolded only, a change request at go-live).
    await expect(page.getByRole('group', { name: 'اللغة' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Request Tracker');

    // Mirrored: the start is now on the right.
    expect(await centre(page, avatar)).toBeGreaterThan(0.5);

    await page.getByRole('button', { name: 'تغيير اللغة إلى English' }).click();
    await expect(html).toHaveAttribute('dir', 'ltr');
  });

  test('sends a nonce-based CSP and no third-party origins', async ({ page }) => {
    const response = await page.goto('/sign-in');
    const csp = response?.headers()['content-security-policy'] ?? '';
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).not.toMatch(/https?:\/\//);
  });
});
