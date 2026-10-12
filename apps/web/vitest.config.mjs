import { baseTestConfig } from '@sirius-hr/config/vitest';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const base = baseTestConfig({
  environment: 'jsdom',
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  coverageInclude: ['src/**/*.ts', 'src/**/*.tsx'],
  setupFiles: ['./src/test-setup.ts'],
  coverageExclude: ['src/test-setup.ts', 'src/test-support/**'],
});

export default defineConfig({
  ...base,
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { ...base.test, globals: true },
});
