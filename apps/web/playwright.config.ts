import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

// Runs against the production build (`next start`), so CSP and security headers are the real
// ones. NFR-BRW-01: latest Chrome, Edge and Safari on desktop and tablet.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'] } },
  ],
  webServer: {
    command: `pnpm exec next start --port ${String(PORT)}`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
