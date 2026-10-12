import { expect, test } from '@playwright/test';

// Internal i18n standard (ADR-001): demonstrate an en ↔ ar switch with a mirrored layout.
test.describe('language and direction switch', () => {
  test('switches the page to Arabic, right-to-left, and back', async ({ page }) => {
    await page.goto('/');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(html).toHaveAttribute('dir', 'ltr');

    const appName = page.locator('header p').first();
    const switcher = page.getByRole('group', { name: 'Language' });
    const ltrName = await appName.boundingBox();
    const ltrSwitcher = await switcher.boundingBox();
    expect(ltrName?.x).toBeLessThan(ltrSwitcher?.x ?? 0);

    await page.getByRole('button', { name: 'Switch language to العربية' }).click();

    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('مرحباً');

    // Mirrored: the app name now sits to the right of the language switcher.
    const rtlName = await appName.boundingBox();
    const rtlSwitcher = await page.getByRole('group', { name: 'اللغة' }).boundingBox();
    expect(rtlName?.x).toBeGreaterThan(rtlSwitcher?.x ?? Number.POSITIVE_INFINITY);

    await page.getByRole('button', { name: 'تغيير اللغة إلى English' }).click();
    await expect(html).toHaveAttribute('dir', 'ltr');
  });

  test('sends a nonce-based CSP and no third-party origins', async ({ page }) => {
    const response = await page.goto('/');
    const csp = response?.headers()['content-security-policy'] ?? '';
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).not.toMatch(/https?:\/\//);
  });
});
