// Static file serving for the built Astro site (dist/).
// Deliberately NO SPA fallback: real routes only — unknown paths fall
// through to the 404 handler in app.js, which serves dist/404.html.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

/**
 * Resolve a request path to a file in dist/ and return a Response,
 * or null when nothing matches (caller should continue/404).
 * `/about` → dist/about/index.html; `/` → dist/index.html.
 */
export function serveStaticFile(c) {
  let pathname
  try {
    pathname = decodeURIComponent(c.req.path)
  } catch {
    return null
  }
  if (pathname.includes('\0') || pathname.includes('..')) return null

  let file = path.join(DIST, pathname)
  if (pathname.endsWith('/') || !path.extname(pathname)) {
    file = path.join(file, 'index.html')
  }

  const resolved = path.resolve(file)
  if (!resolved.startsWith(DIST)) return null // traversal guard
  if (!existsSync(resolved)) return null

  let body
  try {
    body = readFileSync(resolved)
  } catch {
    return null
  }

  const ext = path.extname(resolved).toLowerCase()
  const headers = {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  }
  // Astro emits content-hashed assets under dist/_astro/ — cache those forever.
  headers['Cache-Control'] = resolved.includes(`${path.sep}_astro${path.sep}`)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache'

  return c.newResponse(body, 200, headers)
}

/** Serve the Astro 404 page (dist/404.html) with a real 404 status. */
export function serve404(c) {
  const file = path.join(DIST, '404.html')
  try {
    const body = readFileSync(file, 'utf8')
    return c.html(body, 404)
  } catch {
    return c.text('Not found', 404)
  }
}
