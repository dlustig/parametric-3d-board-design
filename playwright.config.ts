import { defineConfig, devices } from '@playwright/test'

// Shell spec §16: 1440×900 fits both panes beside a usable canvas; the
// narrow (<1024 px) layout is tested explicitly at 820×1180.
const viewport = { width: 1440, height: 900 }

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    viewport,
  },
  webServer: {
    command: 'pnpm dev',
    port: 5173,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport } },
    { name: 'chromium-touch', use: { ...devices['Desktop Chrome'], viewport, hasTouch: true, isMobile: true } },
  ],
})
