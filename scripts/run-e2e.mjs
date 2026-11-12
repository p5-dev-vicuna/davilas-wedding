#!/usr/bin/env bun
// Runs the Playwright E2E suite against the production build.
//
// Why this exists: Playwright's built-in webServer teardown is unreliable in
// some Windows environments (the spawned server survives and holds pipes
// open). Locally we therefore start the built server ourselves (via Bun —
// this script runs under bun, so process.execPath IS the bun executable) and
// stop the exact process we spawned — deterministic on every platform. Under
// CI (CI=1) Playwright manages its own webServer, which works fine on Linux.
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const bun = process.execPath;
const isCi = Boolean(process.env.CI);
const baseURL = `http://localhost:${process.env.PORT || 3000}`;

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", (err) => resolve({ code: 1, err }));
    child.on("exit", (code) => resolve({ code: code ?? 1 }));
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await delay(300);
  }
  return false;
}

async function main() {
  // 1. Production build: server bundle + built pages into dist/.
  const build = await run(bun, ["run", "build"]);
  if (build.code !== 0) return 1;

  // 2. Under CI, let Playwright spawn/stop its own webServer (Linux is fine).
  if (isCi) {
    const tests = await run(bun, ["x", "playwright", "test"]);
    return tests.code;
  }

  // 3. Locally: start the built server ourselves (from dist/, where the
  //    bundle's asset manifest resolves); Playwright reuses it.
  const server = spawn(bun, ["index.js"], {
    cwd: "dist",
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, BUN_DEV: "" },
  });
  let stopping = false;

  async function stopServer() {
    if (stopping) return;
    stopping = true;
    server.kill();
    const exited = await Promise.race([
      new Promise((resolve) => server.once("exit", () => resolve(true))),
      delay(3000).then(() => false),
    ]);
    if (!exited) {
      // Belt & braces (Windows): hard-kill the whole tree.
      spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      await delay(500);
    }
  }

  process.on("SIGINT", () => {
    stopServer().finally(() => process.exit(130));
  });
  process.on("SIGTERM", () => {
    stopServer().finally(() => process.exit(143));
  });

  let code;
  try {
    const ready = await waitForServer(`${baseURL}/`);
    if (!ready) {
      console.error(`[e2e] server never became ready at ${baseURL}`);
      code = 1;
    } else {
      const tests = await run(bun, ["x", "playwright", "test"]);
      code = tests.code;
    }
  } finally {
    await stopServer();
  }
  return code;
}

main().then((code) => process.exit(code));
