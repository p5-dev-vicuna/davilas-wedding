#!/usr/bin/env node
// The Davilas — server entrypoint.
// Serves the built static site (dist/) plus the API on port 3000 (or $PORT).
import { serve } from '@hono/node-server'
import { loadEnvFile } from './env.js'
import { app } from './app.js'
import { dbConfigured } from './db.js'

loadEnvFile()

const port = Number(process.env.PORT) || 3000

if (!dbConfigured()) {
  console.warn(
    '\n[server] DATABASE_URL is not set — RSVP, song, and address submissions will return 503\n' +
      '          until Neon credentials are configured. Copy .env.example to .env to start.\n'
  )
}
if (!process.env.ADMIN_KEY) {
  console.warn(
    '[server] ADMIN_KEY is not set — admin endpoints (GET /api/rsvps, /api/rsvps.csv,\n' +
      '         /api/addresses, /api/addresses.csv) are disabled.\n'
  )
}

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] The Davilas are ready — http://localhost:${info.port} (dist/ + /api)`)
})

function shutdown(signal) {
  console.log(`\n[server] ${signal} received — closing gracefully.`)
  const forceExit = setTimeout(() => process.exit(0), 2000)
  forceExit.unref()
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
