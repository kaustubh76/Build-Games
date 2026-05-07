import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // Disable PostCSS so vitest doesn't try to load the Tailwind 4 config (it's
  // ESM and uses the `@tailwindcss/postcss` plugin format which Vite's PostCSS
  // loader can't parse). We don't render CSS in tests anyway.
  css: { postcss: { plugins: [] } },
  test: {
    // Default to node; per-suite override happens via the `// @vitest-environment happy-dom`
    // pragma at the top of DOM tests. Cleaner than name-globbing across two configs.
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '__tests__/**', // Legacy stale test (eventTracking.test.ts) — replaced by test/integration/fuji-rpc.test.ts
      'test/e2e/**', // Playwright owns these
      'test/load/**', // Soak/chaos suites — run via `npm run test:soak`
    ],
    testTimeout: 60_000, // Integration tests scan up to 200k Fuji blocks
    hookTimeout: 30_000,
    retry: 2, // Fuji public RPC is occasionally flaky
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Coverage scoped to the code this session introduced. Legacy code
      // is unmeasured here — adding broader coverage is its own scope.
      include: [
        'src/lib/safetyLimits.ts',
        'src/app/api/mirror/**',
        'src/app/api/copy-trade/whale-mirror/**',
        'src/app/api/copy-trade/audit/**',
        'src/app/api/safety/**',
        'src/app/api/arena/replays/**',
        'src/app/api/markets/ticker/**',
        'src/app/api/cron/sync-agent-events/**',
        'src/app/api/whale-alerts/stream/**',
        'src/hooks/useMirrorWhaleTrade.ts',
        'src/hooks/useWhaleAlertStream.ts',
      ],
      exclude: [
        '**/*.d.ts',
        '**/__tests__/**',
        'src/app/api/flow/**', // deprecated alias re-exports
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
    pool: 'forks', // isolate per-file (process.env state in safetyLimits, etc.)
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
