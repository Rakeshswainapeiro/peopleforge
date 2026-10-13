// Runs the test OpenID provider for Playwright (see playwright.config.ts `webServer`).
import { startTestOidcProvider } from '@sirius/identity/testing';
import { E2E } from './env.ts';
import { USERS } from './users.ts';

const provider = await startTestOidcProvider({
  clientId: E2E.clientId,
  clientSecret: E2E.clientSecret,
  audience: E2E.audience,
  tenantId: E2E.tenantId,
  issuerPath: '/realms/sirius',
  port: E2E.oidcPort,
  users: USERS,
});
process.stdout.write(`Test OIDC provider at ${provider.issuer}\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void provider.close().then(() => process.exit(0));
  });
}
