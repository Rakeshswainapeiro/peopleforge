import { baseTestConfig } from '@sirius/config/vitest';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const base = baseTestConfig({
  environment: 'jsdom',
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  coverageInclude: ['src/**/*.ts', 'src/**/*.tsx'],
  setupFiles: ['./src/test-setup.ts'],
  // index.ts only re-exports; every export is exercised through its own module's tests.
  coverageExclude: ['src/test-setup.ts', 'src/index.ts'],
});

export default defineConfig({ ...base, plugins: [react()], test: { ...base.test, globals: true } });
