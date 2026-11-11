// Neon Postgres access over the serverless HTTP driver — no persistent
// connections, no pool to manage. Returns null when DATABASE_URL isn't
// configured so the API can respond with a clear 503 (the site deploys
// before database credentials exist).
import { neon } from '@neondatabase/serverless'

let sql = null
let warned = false

/** Returns the Neon query function, or null when DATABASE_URL is not set. */
export function getDb() {
  if (!process.env.DATABASE_URL) {
    if (!warned) {
      warned = true
      console.warn(
        '[db] DATABASE_URL is not set — submission endpoints will return 503 ' +
          'until Neon credentials are configured (see .env.example).'
      )
    }
    return null
  }
  if (!sql) {
    sql = neon(process.env.DATABASE_URL)
    console.log('[db] Neon HTTP driver configured.')
  }
  return sql
}

export function dbConfigured() {
  return Boolean(process.env.DATABASE_URL)
}
