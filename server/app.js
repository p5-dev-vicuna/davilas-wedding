// The Bun.serve app: HTML pages as routes (imports processed by Bun's
// bundler), API endpoints, and a fetch fallback for public/ assets + the
// styled 404. createApp() is exported separately from index.js so unit tests
// can boot the whole server on an ephemeral port and drive it with real HTTP.
import crypto from "node:crypto";
import indexPage from "../pages/index.html";
import aboutPage from "../pages/about.html";
import rsvpPage from "../pages/rsvp.html";
import schedulePage from "../pages/schedule.html";
import travelPage from "../pages/travel.html";
import detailsPage from "../pages/details.html";
import weddingPartyPage from "../pages/wedding-party.html";
import galleryPage from "../pages/gallery.html";
import faqPage from "../pages/faq.html";
import registryPage from "../pages/registry.html";
import songsPage from "../pages/songs.html";
import { getDb } from "./db.js";
import { validateRsvp, validateSong } from "./validate.js";
import { createRateLimiter } from "./rate-limit.js";
import { serve404, servePublicFile } from "./static.js";
import { firstName } from "../shared/songs.js";

/* ---------------------------- rate limiting ---------------------------- */
// In-memory token bucket: 60 requests/minute/IP burst — plenty for guests,
// and generous enough for the E2E suite on localhost.
const limiter = createRateLimiter({ capacity: 60, refillPerMinute: 60 });

function clientIp(req, server) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return server?.requestIP?.(req)?.address ?? "unknown";
}

/** Returns a 429 Response when the client is out of tokens, else null. */
function rateLimitDenial(req, server) {
  const { ok, retryAfter } = limiter.check(clientIp(req, server));
  if (ok) return null;
  return Response.json(
    { error: "Too many requests — please slow down a little." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/* -------------------------------- helpers ------------------------------- */

const NOT_CONFIGURED_MESSAGE =
  "Submissions aren't available just yet — please try again soon.";
const GENERIC_ERROR_MESSAGE =
  "Something went wrong on our end — please try again in a moment.";

async function jsonBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function timingSafeEqualStrings(a, b) {
  const hashA = crypto.createHash("sha256").update(String(a)).digest();
  const hashB = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/** Returns null when authorized, or a { status, message } denial. */
function adminDenial(req) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    console.warn(
      "[api] admin endpoint reached but ADMIN_KEY is not configured — refusing",
    );
    return {
      status: 503,
      message: "Admin access is not configured on this server.",
    };
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!token || !timingSafeEqualStrings(token, adminKey)) {
    return { status: 401, message: "Unauthorized." };
  }
  return null;
}

function jsonError(message, status) {
  return Response.json({ error: message }, { status });
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Normalize DB driver date objects into ISO strings.
  if (text === "[object Date]") text = new Date(value).toISOString();
  if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

function isoOrNull(value) {
  return value instanceof Date ? value.toISOString() : value;
}

/* --------------------------------- API ---------------------------------- */

async function postRsvp(req, server) {
  const denial = rateLimitDenial(req, server);
  if (denial) return denial;

  const body = await jsonBody(req);
  if (body === null || typeof body !== "object") {
    return jsonError("Expected a JSON request body.", 400);
  }

  const result = validateRsvp(body);
  if (!result.ok) {
    return Response.json(
      { error: "Validation failed.", errors: result.errors },
      { status: 422 },
    );
  }

  const db = getDb();
  if (!db) {
    console.warn(
      "[api] POST /api/rsvp reached without DATABASE_URL — returning 503",
    );
    return jsonError(NOT_CONFIGURED_MESSAGE, 503);
  }

  try {
    const v = result.value;
    await db`
      INSERT INTO rsvps (full_name, attending, party_size, allergies, song_request, notes)
      VALUES (${v.full_name}, ${v.attending}, ${v.party_size}, ${v.allergies}, ${v.song_request}, ${v.notes})
    `;
    return Response.json(
      { ok: true, message: "Thank you — your RSVP is in!" },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api] failed to insert RSVP:", err); // server log only — never leaked
    return jsonError(GENERIC_ERROR_MESSAGE, 500);
  }
}

async function postSong(req, server) {
  const denial = rateLimitDenial(req, server);
  if (denial) return denial;

  const body = await jsonBody(req);
  if (body === null || typeof body !== "object") {
    return jsonError("Expected a JSON request body.", 400);
  }

  const result = validateSong(body);
  if (!result.ok) {
    return Response.json(
      { error: "Validation failed.", errors: result.errors },
      { status: 422 },
    );
  }

  const db = getDb();
  if (!db) {
    console.warn(
      "[api] POST /api/song reached without DATABASE_URL — returning 503",
    );
    return jsonError(NOT_CONFIGURED_MESSAGE, 503);
  }

  try {
    const v = result.value;
    await db`
      INSERT INTO song_requests (title, artist, requested_by)
      VALUES (${v.title}, ${v.artist}, ${v.requested_by})
    `;
    return Response.json(
      { ok: true, message: "Thank you — the DJ's notebook grows!" },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api] failed to insert song request:", err);
    return jsonError(GENERIC_ERROR_MESSAGE, 500);
  }
}

async function getSongs(req, server) {
  const denial = rateLimitDenial(req, server);
  if (denial) return denial;

  const db = getDb();
  if (!db) {
    // Public read: an empty list keeps the page graceful pre-configuration.
    return Response.json({ songs: [] });
  }
  try {
    const rows = await db`
      SELECT title, artist, requested_by, created_at
      FROM song_requests
      ORDER BY created_at DESC
      LIMIT 100
    `;
    const songs = rows.map((row) => ({
      title: row.title,
      artist: row.artist,
      requestedBy: firstName(row.requested_by), // first names only — privacy
      createdAt: isoOrNull(row.created_at),
    }));
    return Response.json({ songs });
  } catch (err) {
    console.error("[api] failed to list songs:", err);
    return jsonError(GENERIC_ERROR_MESSAGE, 500);
  }
}

async function getRsvps(req, server) {
  const denial = rateLimitDenial(req, server);
  if (denial) return denial;

  const denied = adminDenial(req);
  if (denied) return jsonError(denied.message, denied.status);

  const db = getDb();
  if (!db) {
    console.warn(
      "[api] GET /api/rsvps reached without DATABASE_URL — returning 503",
    );
    return jsonError("The database is not configured yet.", 503);
  }
  try {
    const rows = await db`
      SELECT id, full_name, attending, party_size, allergies, song_request, notes, created_at
      FROM rsvps
      ORDER BY created_at DESC
    `;
    return Response.json({
      count: rows.length,
      rsvps: rows.map((row) => ({
        ...row,
        created_at: isoOrNull(row.created_at),
      })),
    });
  } catch (err) {
    console.error("[api] failed to list RSVPs:", err);
    return jsonError(GENERIC_ERROR_MESSAGE, 500);
  }
}

async function getRsvpsCsv(req, server) {
  const denial = rateLimitDenial(req, server);
  if (denial) return denial;

  const denied = adminDenial(req);
  if (denied) return jsonError(denied.message, denied.status);

  const db = getDb();
  if (!db) {
    return jsonError("The database is not configured yet.", 503);
  }
  try {
    const rows = await db`
      SELECT id, full_name, attending, party_size, allergies, song_request, notes, created_at
      FROM rsvps
      ORDER BY created_at DESC
    `;
    const header =
      "id,full_name,attending,party_size,allergies,song_request,notes,created_at";
    const lines = rows.map((row) =>
      [
        row.id,
        csvEscape(row.full_name),
        row.attending ? "yes" : "no",
        row.party_size,
        csvEscape(row.allergies),
        csvEscape(row.song_request),
        csvEscape(row.notes),
        csvEscape(isoOrNull(row.created_at)),
      ].join(","),
    );
    // BOM so Excel opens UTF-8 happily.
    const csv = "\uFEFF" + [header, ...lines].join("\r\n");
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="rsvps.csv"',
      },
    });
  } catch (err) {
    console.error("[api] failed to export RSVPs:", err);
    return jsonError(GENERIC_ERROR_MESSAGE, 500);
  }
}

/* ------------------------------ route table ----------------------------- */

export function createRoutes() {
  return {
    // Pages — HTML imports; Bun bundles them (dev/HMR on demand, pre-built
    // manifest in production).
    "/": indexPage,
    "/about": aboutPage,
    "/rsvp": rsvpPage,
    "/schedule": schedulePage,
    "/travel": travelPage,
    "/details": detailsPage,
    "/wedding-party": weddingPartyPage,
    "/gallery": galleryPage,
    "/faq": faqPage,
    "/registry": registryPage,
    "/songs": songsPage,
    // API — HTTP method handlers inline.
    "/api/rsvp": { POST: postRsvp },
    "/api/song": { POST: postSong },
    "/api/songs": { GET: getSongs },
    "/api/rsvps": { GET: getRsvps },
    "/api/rsvps.csv": { GET: getRsvpsCsv },
  };
}

/** Fallback for unmatched routes: public/ assets, else the styled 404. */
export async function fetchFallback(req) {
  return (await servePublicFile(req)) ?? (await serve404());
}

/**
 * Boot the whole app. Returns the Bun server (with .port/.stop).
 * @param {{ port?: number, development?: boolean }} options
 */
export function createApp({ port = 3000, development = false } = {}) {
  return Bun.serve({
    port,
    ...(development ? { development: { hmr: true, console: true } } : {}),
    routes: createRoutes(),
    fetch: fetchFallback,
  });
}
