import { baseTestConfig } from '@sirius/config/vitest';
import { defineConfig } from 'vitest/config';

const base = baseTestConfig({
  // src/cli/* only parse argv/env and call the tested functions; they exit the process.
  coverageExclude: ['src/cli/**', 'src/test-support/**'],
});

// Integration tests share one real database: run files one at a time.
export default defineConfig({ ...base, test: { ...base.test, fileParallelism: false } });
