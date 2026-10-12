import { baseTestConfig } from '@sirius-hr/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  baseTestConfig({
    // server.ts only wires process signals and the listening socket; all logic it calls is
    // unit-tested through createApp/createShutdown. Covered by the container smoke test instead.
    coverageExclude: ['src/server.ts', 'src/test-support/**'],
  }),
);
