// G9 performance (`pnpm perf`): e2e/performance.spec.ts against a production
// build with the test hook (`vite build --mode perf`, run by the script),
// served by `vite preview`. Chromium, one worker, three repeats.

import { defineConfig, devices } from '@playwright/test'

process.env.PERF = '1'

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'performance.spec.ts',
  reporter: 'list',
  workers: 1,
  repeatEach: 3,
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'pnpm exec vite preview --outDir dist/perf --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 800 } } }],
})
