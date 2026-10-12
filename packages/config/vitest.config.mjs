/**
 * Shared Vitest options. The 100% thresholds are a project rule (see CONTRIBUTING.md) and must
 * not be lowered per-workspace; exclude genuinely untestable files with a justification instead.
 *
 * @param {{ environment?: 'node' | 'jsdom', include?: string[], coverageInclude?: string[], coverageExclude?: string[], setupFiles?: string[] }} [options]
 */
export function baseTestConfig(options = {}) {
  const {
    environment = 'node',
    include = ['src/**/*.test.ts'],
    coverageInclude = ['src/**/*.ts'],
    coverageExclude = [],
    setupFiles = [],
  } = options;

  return {
    test: {
      environment,
      include,
      setupFiles,
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov', 'json-summary'],
        include: coverageInclude,
        exclude: ['**/*.test.*', '**/*.d.ts', ...coverageExclude],
        thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  };
}
