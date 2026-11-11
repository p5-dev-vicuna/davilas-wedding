// The Hono app: API endpoints + static serving of the built site.
// Exported separately from index.js so unit tests can drive it with
// app.request() without binding a port.
import crypto from 'node:crypto'
import { Hono } from 'hono'
import { getDb } from './db.js'
import { validateRsvp, validateSong } from './validate.js'
import { createRateLimiter } from './rate-limit.js'
import { serve404, serveStaticFile } from './static.js'
import { firstName } from '../shared/songs.js'

export const app = new Hono()

/* ---------------------------- rate limiting ---------------------------- */
// In-memory token bucket: 60 requests/minute/IP burst — plenty for guests,
// and generous enough for the E2E suite on localhost.
const limiter = createRateLimiter({ capacity: 60, refillPerMinute: 60 })

function clientIp(c) {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }
  return c.env?.incoming?.socket?.remoteAddress ?? 'unknown'
}

/* -------------------------------- helpers ------------------------------- */

const NOT_CONFIGURED_MESSAGE =
  "Submissions aren't available just yet — please try again soon."
const GENERIC_ERROR_MESSAGE = 'Something went wrong on our end — please try again in a moment.'

function jsonBody(c) {
  return c.req.json().catch(() => null)
}

function timingSafeEqualStrings(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest()
  const hashB = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(hashA, hashB)
}

/** Returns null when authorized, or a { status, message } denial. */
function adminDenial(c) {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) {
    console.warn('[api] admin endpoint reached but ADMIN_KEY is not configured — refusing')
    return { status: 503, message: 'Admin access is not configured on this server.' }
  }
  const header = c.req.header('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token || !timingSafeEqualStrings(token, adminKey)) {
    return { status: 401, message: 'Unauthorized.' }
  }
  return null
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // Normalize DB driver date objects into ISO strings.
  if (text === '[object Date]') text = new Date(value).toISOString()
  if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`
  return text
}

/* --------------------------------- API ---------------------------------- */

const api = new Hono()

api.use('*', async (c, next) => {
  const { ok, retryAfter } = limiter.check(clientIp(c))
  if (!ok) {
    return c.json(
      { error: 'Too many requests — please slow down a little.' },
      429,
      { 'Retry-After': String(retryAfter) }
    )
  }
  await next()
})

api.post('/rsvp', async (c) => {
  const body = await jsonBody(c)
  if (body === null || typeof body !== 'object') {
    return c.json({ error: 'Expected a JSON request body.' }, 400)
  }

  const result = validateRsvp(body)
  if (!result.ok) {
    return c.json({ error: 'Validation failed.', errors: result.errors }, 422)
  }

  const db = getDb()
  if (!db) {
    console.warn('[api] POST /api/rsvp reached without DATABASE_URL — returning 503')
    return c.json({ error: NOT_CONFIGURED_MESSAGE }, 503)
  }

  try {
    const v = result.value
    await db`
      INSERT INTO rsvps (full_name, attending, party_size, allergies, song_request, notes)
      VALUES (${v.full_name}, ${v.attending}, ${v.party_size}, ${v.allergies}, ${v.song_request}, ${v.notes})
    `
    return c.json({ ok: true, message: 'Thank you — your RSVP is in!' }, 201)
  } catch (err) {
    console.error('[api] failed to insert RSVP:', err) // server log only — never leaked
    return c.json({ error: GENERIC_ERROR_MESSAGE }, 500)
  }
})

api.post('/song', async (c) => {
  const body = await jsonBody(c)
  if (body === null || typeof body !== 'object') {
    return c.json({ error: 'Expected a JSON request body.' }, 400)
  }

  const result = validateSong(body)
  if (!result.ok) {
    return c.json({ error: 'Validation failed.', errors: result.errors }, 422)
  }

  const db = getDb()
  if (!db) {
    console.warn('[api] POST /api/song reached without DATABASE_URL — returning 503')
    return c.json({ error: NOT_CONFIGURED_MESSAGE }, 503)
  }

  try {
    const v = result.value
    await db`
      INSERT INTO song_requests (title, artist, requested_by)
      VALUES (${v.title}, ${v.artist}, ${v.requested_by})
    `
    return c.json({ ok: true, message: "Thank you — the DJ's notebook grows!" }, 201)
  } catch (err) {
    console.error('[api] failed to insert song request:', err)
    return c.json({ error: GENERIC_ERROR_MESSAGE }, 500)
  }
})

api.get('/songs', async (c) => {
  const db = getDb()
  if (!db) {
    // Public read: an empty list keeps the page graceful pre-configuration.
    return c.json({ songs: [] })
  }
  try {
    const rows = await db`
      SELECT title, artist, requested_by, created_at
      FROM song_requests
      ORDER BY created_at DESC
      LIMIT 100
    `
    const songs = rows.map((row) => ({
      title: row.title,
      artist: row.artist,
      requestedBy: firstName(row.requested_by), // first names only — privacy
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }))
    return c.json({ songs })
  } catch (err) {
    console.error('[api] failed to list songs:', err)
    return c.json({ error: GENERIC_ERROR_MESSAGE }, 500)
  }
})

api.get('/rsvps', async (c) => {
  const denied = adminDenial(c)
  if (denied) return c.json({ error: denied.message }, denied.status)

  const db = getDb()
  if (!db) {
    console.warn('[api] GET /api/rsvps reached without DATABASE_URL — returning 503')
    return c.json({ error: 'The database is not configured yet.' }, 503)
  }
  try {
    const rows = await db`
      SELECT id, full_name, attending, party_size, allergies, song_request, notes, created_at
      FROM rsvps
      ORDER BY created_at DESC
    `
    return c.json({
      count: rows.length,
      rsvps: rows.map((row) => ({
        ...row,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      })),
    })
  } catch (err) {
    console.error('[api] failed to list RSVPs:', err)
    return c.json({ error: GENERIC_ERROR_MESSAGE }, 500)
  }
})

api.get('/rsvps.csv', async (c) => {
  const denied = adminDenial(c)
  if (denied) return c.json({ error: denied.message }, denied.status)

  const db = getDb()
  if (!db) {
    return c.json({ error: 'The database is not configured yet.' }, 503)
  }
  try {
    const rows = await db`
      SELECT id, full_name, attending, party_size, allergies, song_request, notes, created_at
      FROM rsvps
      ORDER BY created_at DESC
    `
    const header = 'id,full_name,attending,party_size,allergies,song_request,notes,created_at'
    const lines = rows.map((row) =>
      [
        row.id,
        csvEscape(row.full_name),
        row.attending ? 'yes' : 'no',
        row.party_size,
        csvEscape(row.allergies),
        csvEscape(row.song_request),
        csvEscape(row.notes),
        csvEscape(row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at),
      ].join(',')
    )
    // BOM so Excel opens UTF-8 happily.
    const csv = '\uFEFF' + [header, ...lines].join('\r\n')
    return c.body(csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rsvps.csv"',
    })
  } catch (err) {
    console.error('[api] failed to export RSVPs:', err)
    return c.json({ error: GENERIC_ERROR_MESSAGE }, 500)
  }
})

app.route('/api', api)

/* ------------------------- static site (dist/) -------------------------- */
// Real routes only — no SPA fallback. Unknown paths hit app.notFound.
app.get('*', async (c, next) => {
  const res = serveStaticFile(c)
  if (res) return res
  return next()
})

app.notFound((c) => serve404(c))
