import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Soak / chaos test runner. Separate from the default `npm run test` because:
 *   - These tests are slow (per-test budget 30s) and produce real concurrent
 *     load that flake-prone retries would mask.
 *   - retry: 0 — chaos tests must not paper over flakes.
 *   - singleFork — state isolation across files matters more than parallelism;
 *     concurrency comes from `Promise.all` inside a single test.
 *   - Inspector functions (e.g. `__getStreamState`, `__getRateLimitState`) are
 *     gated by NODE_ENV !== 'production'; we leave NODE_ENV as 'test' default.
 *
 * Run via:  npm run test:soak
 */
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/load/**/*.soak.test.ts', 'test/load/**/*.soak.test.tsx'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    testTimeout: 30_000, // Hard ceiling per soak test
    hookTimeout: 15_000,
    retry: 0, // Chaos must not be papered over
    pool: 'forks',
    poolOptions: {
      forks: {
        // Each test file gets its own fork. This prevents mock-registration
        // pollution across files (e.g. one file's vi.doMock('@/lib/viemClient')
        // bleeding into another file's tests). Concurrency within a file
        // still comes from Promise.all inside individual tests.
        singleFork: false,
      },
    },
    fileParallelism: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
