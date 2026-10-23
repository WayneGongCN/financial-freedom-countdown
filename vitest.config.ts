import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
  },
});
