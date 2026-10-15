import { baseTestConfig } from '@sirius/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  baseTestConfig({
    // main.ts only reads the environment and wires process signals; everything it calls is
    // tested through createWorker and the E2E run (the worker sends the submit emails).
    coverageExclude: ['src/main.ts', 'src/test-support/**'],
  }),
);
