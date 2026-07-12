import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Integration tests share one Supabase connection; avoid parallel file runs
    // fighting over the pool.
    fileParallelism: false,
  },
});
