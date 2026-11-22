// The Bun.serve app: HTML pages as routes (imports processed by Bun's
// bundler), API endpoints, and a fetch fallback for public/ assets + the
// styled 404. createApp() is exported separately from index.js so unit tests
// can boot the whole server on an ephemeral port and drive it with real HTTP.
import path from "node:path";
import crypto from "node:crypto";
import indexPage from "../pages/index.html";
import aboutPage from "../pages/about.html";
import rsvpPage from "../pages/rsvp.html";
import addressPage from "../pages/address.html";
import schedulePage from "../pages/schedule.html";
import travelPage from "../pages/travel.html";
import detailsPage from "../pages/details.html";
import weddingPartyPage from "../pages/wedding-party.html";
import galleryPage from "../pages/gallery.html";
import faqPage from "../pages/faq.html";
import registryPage from "../pages/registry.html";
import songsPage from "../pages/songs.html";
import privacyPage from "../pages/privacy.html";
import termsPage from "../pages/terms.html";
import { getDb } from "./db.js";
import { validateAddress, validateRsvp, validateSong } from "./validate.js";
import { createRateLimiter } from "./rate-limit.js";
import { serve404, servePublicFile } from "./static.js";
import { firstName } from "../shared/songs.js";
import { restoreAssetUrls } from "../scripts/asset-url-mask.mjs";

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
const ADDRESS_INVITE_ONLY_MESSAGE =
  "This page is for guests with a personal link — check your text from " +
  "Kendra & Nando. Didn't get one? Your invitation is on its way — no " +
  "need to do anything yet.";

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

/** Spread a DB row with created_at normalized to an ISO string. */
function isoRow(row) {
  return { ...row, created_at: isoOrNull(row.created_at) };
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

/* ---------------------- invite-only address gate ------------------------ */

/**
 * GET /api/address/validate?g=<token> — public. Tells the /address page
 * whether the personal-link token is real and, if so, which guest it
 * belongs to (so the page can greet them by name). Fail-closed: missing
 * token, unknown token, unconfigured DB, or a DB error all mean
 * { valid: false } — the page then shows the invite-only state.
 */
async function getAddressValidate(req, server) {
  const denial = rateLimitDenial(req, server);
  if (denial) return denial;

  const token =
    new URL(req.url).searchParams.get("g")?.trim().slice(0, 64) ?? "";
  if (!token) return Response.json({ valid: false });

  const db = getDb();
  if (!db) return Response.json({ valid: false });

  try {
    const rows = await db`
      SELECT guest_name FROM guest_tokens WHERE token = ${token} LIMIT 1
    `;
    const row = rows[0];
    return Response.json(
      row ? { valid: true, guest_name: row.guest_name } : { valid: false },
    );
  } catch (err) {
    console.error("[api] failed to validate guest token:", err); // server log only
    return Response.json({ valid: false });
  }
}

async function postAddress(req, server) {
  const denial = rateLimitDenial(req, server);
  if (denial) return denial;

  const body = await jsonBody(req);
  if (body === null || typeof body !== "object") {
    return jsonError("Expected a JSON request body.", 400);
  }

  const result = validateAddress(body);
  if (!result.ok) {
    return Response.json(
      { error: "Validation failed.", errors: result.errors },
      { status: 422 },
    );
  }

  // Invite-only gate: a submission is only accepted through a personal
  // link. No token → 403 before anything else (fail closed).
  if (!result.value.guest_token) {
    return Response.json(
      { ok: false, error: ADDRESS_INVITE_ONLY_MESSAGE },
      { status: 403 },
    );
  }

  const db = getDb();
  if (!db) {
    console.warn(
      "[api] POST /api/address reached without DATABASE_URL — returning 503",
    );
    return jsonError(NOT_CONFIGURED_MESSAGE, 503);
  }

  try {
    const v = result.value;
    // JOIN check: the row only lands if the token exists in guest_tokens.
    // (Atomic — no window between lookup and insert.)
    const inserted = await db`
      INSERT INTO addresses (full_name, street, unit, city, state, postal_code, country, notes, guest_token)
      SELECT ${v.full_name}, ${v.street}, ${v.unit}, ${v.city}, ${v.state}, ${v.postal_code}, ${v.country}, ${v.notes}, t.token
      FROM guest_tokens t
      WHERE t.token = ${v.guest_token}
      RETURNING id
    `;
    if (inserted.length === 0) {
      return Response.json(
        { ok: false, error: ADDRESS_INVITE_ONLY_MESSAGE },
        { status: 403 },
      );
    }
    return Response.json(
      { ok: true, message: "Sealed and delivered — you're on the list. 💌" },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api] failed to insert address:", err); // server log only — never leaked
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

async function getAddresses(req, server) {
  const denial = rateLimitDenial(req, server);
  if (denial) return denial;

  const denied = adminDenial(req);
  if (denied) return jsonError(denied.message, denied.status);

  const db = getDb();
  if (!db) {
    console.warn(
      "[api] GET /api/addresses reached without DATABASE_URL — returning 503",
    );
    return jsonError("The database is not configured yet.", 503);
  }
  try {
    // LEFT JOIN guest_tokens so each submitted address carries its
    // texted_by ("who texted them") — rows whose token isn't in
    // guest_tokens get NULL.
    const rows = await db`
      SELECT a.id, a.full_name, a.street, a.unit, a.city, a.state, a.postal_code,
             a.country, a.notes, a.guest_token, g.texted_by, a.created_at
      FROM addresses a
      LEFT JOIN guest_tokens g ON g.token = a.guest_token
      ORDER BY a.created_at DESC
    `;
    // Grouped for cross-referencing guest_tokens.csv: matched rows arrived
    // via a personal SMS link, unmatched rows were typed manually.
    const matched = rows.filter((row) => row.guest_token);
    const unmatched = rows.filter((row) => !row.guest_token);
    return Response.json({
      count: rows.length,
      matched: matched.map(isoRow),
      unmatched: unmatched.map(isoRow),
    });
  } catch (err) {
    console.error("[api] failed to list addresses:", err);
    return jsonError(GENERIC_ERROR_MESSAGE, 500);
  }
}

async function getAddressesCsv(req, server) {
  const denial = rateLimitDenial(req, server);
  if (denial) return denial;

  const denied = adminDenial(req);
  if (denied) return jsonError(denied.message, denied.status);

  const db = getDb();
  if (!db) {
    return jsonError("The database is not configured yet.", 503);
  }
  try {
    // Same LEFT JOIN as GET /api/addresses: texted_by per submitted
    // address, empty when the token isn't in guest_tokens.
    const rows = await db`
      SELECT a.id, a.full_name, a.street, a.unit, a.city, a.state, a.postal_code,
             a.country, a.notes, a.guest_token, g.texted_by, a.created_at
      FROM addresses a
      LEFT JOIN guest_tokens g ON g.token = a.guest_token
      ORDER BY a.created_at DESC
    `;
    const header =
      "id,full_name,street,unit,city,state,postal_code,country,notes,guest_token,texted_by,created_at";
    const lines = rows.map((row) =>
      [
        row.id,
        csvEscape(row.full_name),
        csvEscape(row.street),
        csvEscape(row.unit),
        csvEscape(row.city),
        csvEscape(row.state),
        csvEscape(row.postal_code),
        csvEscape(row.country),
        csvEscape(row.notes),
        csvEscape(row.guest_token),
        csvEscape(row.texted_by),
        csvEscape(isoOrNull(row.created_at)),
      ].join(","),
    );
    // BOM so Excel opens UTF-8 happily.
    const csv = "\uFEFF" + [header, ...lines].join("\r\n");
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="addresses.csv"',
      },
    });
  } catch (err) {
    console.error("[api] failed to export addresses:", err);
    return jsonError(GENERIC_ERROR_MESSAGE, 500);
  }
}

/* ------------------------- guest tracking output ------------------------ */

/**
 * GET /api/guests (ADMIN_KEY) — the "who has responded" paste source for
 * the couple's Google Sheet. Every guest_tokens row LEFT JOINed against
 * addresses on guest_token: responded = at least one submitted address
 * (the newest one is reported), address = that submission or null. Sorted
 * unresponded first (they still need a nudge), then by texted_by (so each
 * texter's half sits together — rows with no texter sink to the end), then
 * by guest name.
 */
async function getGuests(req, server) {
  const denial = rateLimitDenial(req, server);
  if (denial) return denial;

  const denied = adminDenial(req);
  if (denied) return jsonError(denied.message, denied.status);

  const db = getDb();
  if (!db) {
    console.warn(
      "[api] GET /api/guests reached without DATABASE_URL — returning 503",
    );
    return jsonError("The database is not configured yet.", 503);
  }
  try {
    // Rows arrive grouped by token, oldest address first — so repeated
    // submissions simply overwrite earlier ones and the latest wins.
    const rows = await db`
      SELECT g.guest_name, g.token, g.texted_by, g.created_at AS guest_created_at,
             a.id, a.full_name, a.street, a.unit, a.city, a.state, a.postal_code,
             a.country, a.notes, a.guest_token, a.created_at
      FROM guest_tokens g
      LEFT JOIN addresses a ON a.guest_token = g.token
      ORDER BY g.token, a.created_at, a.id
    `;
    const byToken = new Map();
    for (const row of rows) {
      let guest = byToken.get(row.token);
      if (!guest) {
        guest = {
          guest_name: row.guest_name,
          token: row.token,
          texted_by: row.texted_by,
          responded: false,
          address: null,
          created_at: isoOrNull(row.guest_created_at),
        };
        byToken.set(row.token, guest);
      }
      if (row.id !== null) {
        guest.responded = true;
        guest.address = isoRow({
          id: row.id,
          full_name: row.full_name,
          street: row.street,
          unit: row.unit,
          city: row.city,
          state: row.state,
          postal_code: row.postal_code,
          country: row.country,
          notes: row.notes,
          guest_token: row.guest_token,
          created_at: row.created_at,
        });
      }
    }
    const guests = [...byToken.values()].sort((a, b) => {
      if (a.responded !== b.responded) return a.responded ? 1 : -1;
      // Unclaimed (empty texted_by) rows sort after every named texter.
      const whoA = a.texted_by || "\uffff";
      const whoB = b.texted_by || "\uffff";
      if (whoA !== whoB) return whoA < whoB ? -1 : 1;
      return a.guest_name.localeCompare(b.guest_name);
    });
    return Response.json({ count: guests.length, guests });
  } catch (err) {
    console.error("[api] failed to list guests:", err);
    return jsonError(GENERIC_ERROR_MESSAGE, 500);
  }
}

/* ----------------------------- HTML page routes -------------------------- */
// The same `import x from "../pages/x.html"` means two different things:
//
//   production (dist/): the build inlines a prebuilt asset manifest
//     ({ index: "./index.html", files: [...] }) and Bun.serve serves it
//     with zero runtime bundling — this is the path that ships.
//
//   dev/test (running from source): the import yields a lazy placeholder
//     that Bun.serve re-bundles on request — and on this canary that lazy
//     bundling dies on the pages' root-absolute asset URLs:
//       error: Could not resolve: "/hero.webp"
//     exactly what scripts/build.mjs masks at build time. Runtime plugins
//     cannot intercept it (verified on bun 1.4.4-canary: a Bun.plugin
//     onLoad fires for the import itself, but the per-request re-bundle
//     re-reads the file from disk and never consults it), so from source
//     the page markup is served directly instead: read the exact file the
//     import points at, apply the shared restore pass (the same public-URL
//     contract the production build guarantees — no marker URLs can ever
//     reach a browser), and rewrite "../public/x" to the "/x" runtime URL
//     it denotes — public/ is already served whole by server/static.js,
//     so styles, favicon, and photos all resolve.
//
// Production is untouched: the manifest check below hands Bun.serve the
// prebuilt bundle exactly as before.

const PAGES_DIR = path.join(import.meta.dir, "..", "pages");

/**
 * Route value for one page import: the prebuilt manifest when running from
 * dist/, else a GET handler serving the page source with public URLs kept
 * verbatim (mask/restore parity with the production build).
 */
function pageRoute(page, file) {
  // Prebuilt manifests carry their file list; source-mode placeholders
  // don't (they only expose an `index` source path on their prototype).
  if (Array.isArray(page?.files)) return page;
  return {
    GET: async () => {
      const html = restoreAssetUrls(
        await Bun.file(path.join(PAGES_DIR, file)).text(),
      );
      const markup = html.replaceAll('="../public/', '="/');
      return new Response(markup, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
  };
}

/* ------------------------------ route table ----------------------------- */

export function createRoutes() {
  return {
    // Pages — HTML imports; Bun bundles them (dev/HMR on demand, pre-built
    // manifest in production; straight from source when unbundled — see
    // pageRoute above).
    "/": pageRoute(indexPage, "index.html"),
    "/about": pageRoute(aboutPage, "about.html"),
    "/rsvp": pageRoute(rsvpPage, "rsvp.html"),
    "/address": pageRoute(addressPage, "address.html"),
    "/schedule": pageRoute(schedulePage, "schedule.html"),
    "/travel": pageRoute(travelPage, "travel.html"),
    "/details": pageRoute(detailsPage, "details.html"),
    "/wedding-party": pageRoute(weddingPartyPage, "wedding-party.html"),
    "/gallery": pageRoute(galleryPage, "gallery.html"),
    "/faq": pageRoute(faqPage, "faq.html"),
    "/registry": pageRoute(registryPage, "registry.html"),
    "/songs": pageRoute(songsPage, "songs.html"),
    "/privacy": pageRoute(privacyPage, "privacy.html"),
    "/terms": pageRoute(termsPage, "terms.html"),
    // API — HTTP method handlers inline.
    "/api/rsvp": { POST: postRsvp },
    "/api/song": { POST: postSong },
    "/api/songs": { GET: getSongs },
    "/api/rsvps": { GET: getRsvps },
    "/api/rsvps.csv": { GET: getRsvpsCsv },
    "/api/address": { POST: postAddress },
    "/api/address/validate": { GET: getAddressValidate },
    "/api/addresses": { GET: getAddresses },
    "/api/addresses.csv": { GET: getAddressesCsv },
    "/api/guests": { GET: getGuests },
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
