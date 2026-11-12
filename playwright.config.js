import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT) || 3000;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI mode: Playwright spawns/stops its own server (the production build
    // from scripts/run-e2e.mjs's `bun run build` step). Locally, run-e2e.mjs
    // starts the exact process itself and Playwright reuses it
    // (reuseExistingServer) — see scripts/run-e2e.mjs for why.
    command: "bun index.js",
    cwd: "dist",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
