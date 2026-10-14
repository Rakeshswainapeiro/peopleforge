// Runs the fake clamd for Playwright (see playwright.config.ts `webServer`): the real clamd
// protocol, reporting the EICAR test file as infected. No ClamAV installation needed.
import { startFakeClamd } from '@peopleforge/integrations/testing';
import { E2E } from './env.ts';

const clamd = await startFakeClamd(E2E.clamavPort);
process.stdout.write(`Fake clamd on port ${String(clamd.port)}\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void clamd.close().then(() => process.exit(0));
  });
}
