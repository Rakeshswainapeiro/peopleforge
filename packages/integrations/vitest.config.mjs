import { baseTestConfig } from '@sirius/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  baseTestConfig({
    // index.ts and testing.ts only re-export; every export is exercised through its module.
    coverageExclude: ['src/index.ts', 'src/testing.ts'],
  }),
);
