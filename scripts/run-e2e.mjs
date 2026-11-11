#!/usr/bin/env node
// Runs the Playwright E2E suite against the built site.
//
// Why this exists: Playwright's built-in webServer teardown is unreliable in
// some Windows environments (the spawned server survives and holds pipes
// open). Locally we therefore start server/index.js ourselves and stop the
// exact process we spawned — deterministic on every platform. Under CI
// (CI=1) Playwright manages its own webServer, which works fine on Linux.
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const isCi = Boolean(process.env.CI)
const baseURL = `http://localhost:${process.env.PORT || 3000}`

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    // .cmd shims (npm on Windows) need a shell since Node's CVE-2024-27980 fix.
    const shell = process.platform === 'win32' && /\.cmd$/i.test(cmd)
    const child = spawn(cmd, args, { stdio: 'inherit', shell, ...opts })
    child.on('error', (err) => resolve({ code: 1, err }))
    child.on('exit', (code) => resolve({ code: code ?? 1 }))
  })
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // not up yet
    }
    await delay(300)
  }
  return false
}

async function main() {
  // 1. Build the static site.
  const build = await run(npm, ['run', 'build'])
  if (build.code !== 0) return 1

  // 2. Under CI, let Playwright spawn/stop its own webServer (Linux is fine).
  if (isCi) {
    const tests = await run(npm, ['exec', '--', 'playwright', 'test'])
    return tests.code
  }

  // 3. Locally: start the server ourselves; Playwright reuses it.
  const server = spawn(process.execPath, ['server/index.js'], {
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  let stopping = false

  async function stopServer() {
    if (stopping) return
    stopping = true
    server.kill()
    const exited = await Promise.race([
      new Promise((resolve) => server.once('exit', () => resolve(true))),
      delay(3000).then(() => false),
    ])
    if (!exited) {
      // Belt & braces (Windows): hard-kill the whole tree.
      spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
      await delay(500)
    }
  }

  process.on('SIGINT', () => {
    stopServer().finally(() => process.exit(130))
  })
  process.on('SIGTERM', () => {
    stopServer().finally(() => process.exit(143))
  })

  let code = 0
  try {
    const ready = await waitForServer(`${baseURL}/`)
    if (!ready) {
      console.error(`[e2e] server never became ready at ${baseURL}`)
      code = 1
    } else {
      const tests = await run(npm, ['exec', '--', 'playwright', 'test'])
      code = tests.code
    }
  } finally {
    await stopServer()
  }
  return code
}

main().then((code) => process.exit(code))
