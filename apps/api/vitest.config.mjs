import { baseTestConfig } from '@sirius/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  baseTestConfig({
    setupFiles: ['./src/test-setup.ts'],
    // main.ts only wires process signals and the listening socket; everything it calls is
    // tested through createApp/createShutdown and covered by the container smoke test.
    coverageExclude: ['src/main.ts', 'src/test-setup.ts', 'src/test-support/**'],
  }),
);
