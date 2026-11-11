import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PORT) || 3000
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Spawn node directly (the build runs in the test:e2e npm script) so
    // Playwright can tear the server down reliably on every platform.
    command: 'node server/index.js',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
