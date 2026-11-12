// Static file serving for public/ assets (favicon, stylesheets, gallery and
// wedding-party photos the couple drops in later) plus the styled 404 page.
// Deliberately NO SPA fallback: real routes only — unknown paths fall through
// to serve404(), which serves pages/404.html with a real 404 status.
import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..");
const PUBLIC_ROOT = path.join(PROJECT_ROOT, "public");
const NOT_FOUND_PAGE = path.join(PROJECT_ROOT, "pages", "404.html");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

/**
 * Resolve a request path to a file in public/ and return a Response,
 * or null when nothing matches (caller should serve the 404 page).
 * Only extensioned files resolve — never a directory listing.
 */
export async function servePublicFile(req) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url).pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0") || pathname.includes("..")) return null;
  if (!path.extname(pathname)) return null;

  const resolved = path.resolve(path.join(PUBLIC_ROOT, pathname));
  if (!resolved.startsWith(PUBLIC_ROOT + path.sep)) return null; // traversal guard

  const file = Bun.file(resolved);
  try {
    if (!(await file.exists())) return null;
  } catch {
    return null;
  }

  const ext = path.extname(resolved).toLowerCase();
  return new Response(file, {
    status: 200,
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      // No content-hashed assets live in public/ — revalidate everything.
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Serve the styled 404 page (pages/404.html) with a real 404 status.
 * Falls back to plain text if the page can't be read for any reason.
 */
export async function serve404() {
  try {
    const file = Bun.file(NOT_FOUND_PAGE);
    if (await file.exists()) {
      return new Response(file, {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-cache",
        },
      });
    }
  } catch {
    // fall through to the plain-text 404
  }
  return new Response("Not found", { status: 404 });
}
