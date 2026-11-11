# BUILD_REPORT — The Davilas wedding site

**Status: complete.** Built from `BRIEF.md` (treated as the single source of truth). Nothing deployed, no external accounts created — local verification only.

## What was built

A deployable wedding website for **Kendra & Nando (The Davilas)** — October 23, 2027, 1513 at Stone Creek, Rockmart, GA:

- **Astro static site** (12 routes, fully static `dist/`) with a save-the-date-inspired design system: cream `#f5f1e8`, sage `#5a6152`, forest `#2e4038`, ink `#33342e`, gold `#a89968`; Cormorant Garamond (display), EB Garamond (body), Great Vibes (script accents); thin gold rules with botanical ❦ dividers; notched-corner panel frames; textured paper background; sticky desktop nav + mobile hamburger; skip-link, labels on every field, focus-visible states, real contrast.
- **One Hono server** (`server/`) that serves `dist/` (real routes only — no SPA fallback; unknown paths get a styled 404) **and** the API.
- **Neon Postgres** access via `@neondatabase/serverless` HTTP driver; `schema.sql` creates `rsvps` + `song_requests` exactly as specified. Without `DATABASE_URL`, the server logs clear warnings and POST endpoints return 503 — the site deploys before creds exist.
- **Pages**: Home (split hero, countdown, section cards), Get to Know Us, RSVP, Schedule (vertical timeline), Travel, Wedding Details, Wedding Party (single editable data array), Gallery (8 tiles + vanilla-JS lightbox), FAQ (details/summary accordion), Registry, Songs (live list), 404. RSVP is a header button, not a nav tab; Songs is linked from RSVP + footer; FAQ from footer only — nav order exactly per brief.
- **Tests**: Vitest unit tests for all API validation, songs dedupe/sort, rate limiter, and the API's no-DB behavior; Playwright E2E with every assertion via `data-testid`.
- **Dockerfile** (multi-stage: `node:22-alpine` build → `node:22-slim` run, `CMD node server/index.js`), `.env.example`, `.dockerignore`, README.

## Files of interest

| Path | Why |
| --- | --- |
| `server/app.js` | Hono app: all five endpoints, admin bearer guard (timing-safe), per-IP token-bucket rate limiting, CSV export, error containment |
| `server/validate.js` | Pure validation (RSVP + song): required fields, party 1–10 integer, caps 120/500/1000/200 + 200/200/120 |
| `server/static.js` | Custom static handler for `dist/`: directory→`index.html`, MIME map, immutable cache for hashed `_astro/` assets, traversal guard |
| `server/db.js` / `server/rate-limit.js` / `server/env.js` | Neon lazy init + clear 503 warnings; in-memory token bucket; tiny `.env` loader |
| `shared/songs.js` | Dedupe key (lowercase title+artist), aggregate + sort (count desc → title → artist), first-name-only helper — shared by browser and server |
| `src/layouts/Base.astro` | Header (monogram, 8 nav tabs in brief order, RSVP button), footer (names/date/venue, Songs + FAQ links, "Questions? Reach out…" line), fonts |
| `src/pages/rsvp.astro` | Guest-note callout above the fields, all brief fields, inline validation, `data-testid` on every field/button/message, accept vs decline confirmations |
| `src/pages/songs.astro` | Form → `POST /api/song`, live "Requests so far" via `GET /api/songs`, client-side dedupe/count |
| `src/pages/wedding-party.astro` / `gallery.astro` / `registry.astro` | Editable-from-frontmatter data arrays with ✏️ COUPLE comment blocks |
| `tests/unit/*.test.js` | 36 tests: validate (12), songs (10), rate-limit (5), api/static (9) |
| `tests/e2e/*.spec.js` | home / rsvp (3) / songs (2) — `data-testid`-only assertions, mocked API routes for CI mode |
| `scripts/run-e2e.mjs` | Cross-platform E2E runner; starts/stops the server it spawns (see notes) |
| `schema.sql`, `Dockerfile`, `.env.example`, `README.md` | Database DDL, deployment, configuration, docs |

## Test results (actual output)

**`npm test`** — Vitest 3.2.7:

```
 ✓ tests/unit/rate-limit.test.js (5 tests) 3ms
 ✓ tests/unit/validate.test.js (12 tests) 6ms
 ✓ tests/unit/songs.test.js (10 tests) 20ms
 ✓ tests/unit/api.test.js (9 tests) 24ms

 Test Files  4 passed (4)
      Tests  36 passed (36)
   Duration  810ms
```

**`npm run build`** — Astro:

```
18:37:09 [build] 12 page(s) built in 994ms
18:37:09 [build] Complete!
```

**`npm run test:e2e`** — Playwright (Chromium, via `scripts/run-e2e.mjs`):

```
  ok 1 [chromium] › home.spec.js:5:1 › home page loads with the names and wedding date visible (321ms)
  ok 2 [chromium] › rsvp.spec.js:6:3 › RSVP › happy path: fill and submit the form, see the warm confirmation (764ms)
  ok 3 [chromium] › rsvp.spec.js:33:3 › RSVP › inline validation catches an empty submit (290ms)
  ok 4 [chromium] › rsvp.spec.js:45:3 › RSVP › declining shows the gentle regrets message (337ms)
  ok 5 [chromium] › songs.spec.js:6:3 › Song requests › submitting a song shows it in the live list, deduped by title+artist (352ms)
  ok 6 [chromium] › songs.spec.js:57:3 › Song requests › inline validation catches an empty submit (282ms)

  6 passed (3.0s)
```

**Manual `npm start` smoke test** (no `DATABASE_URL`/`ADMIN_KEY`, by design):

```
GET  /                -> 200 text/html; charset=utf-8
GET  /rsvp            -> 200 text/html; charset=utf-8
GET  /wedding-party   -> 200 text/html; charset=utf-8
GET  /favicon.svg     -> 200 image/svg+xml
GET  /nope (404 page) -> 404 text/html; charset=UTF-8
GET  /api/songs       -> {"songs":[]}
POST /api/rsvp valid  -> {"error":"Submissions aren't available just yet — please try again soon."} [503]
POST /api/rsvp bad    -> [422]
GET  /api/rsvps       -> [503] (ADMIN_KEY unset)
```

## Decisions & notes

- **E2E mocking**: per the brief's "mock or real server in CI mode", the RSVP/songs specs intercept `/api/*` with stateful Playwright route mocks (the songs mock even exercises live dedupe: submitting "at LAST / etta james" merges into "At Last — Etta James ×2"). This keeps `npm run test:e2e` green without a database.
- **`scripts/run-e2e.mjs`**: Playwright's built-in webServer teardown repeatedly failed to kill the spawned server on this Windows machine (the orphan held pipes open). The runner builds, starts `node server/index.js` itself, lets Playwright reuse it (`reuseExistingServer`), then kills the exact PID it spawned (`taskkill /T /F` as backup). Under `CI=1` Playwright manages its own webServer, which behaves fine on Linux.
- **`GET /api/songs` without a DB** returns `200 {"songs":[]}` (the brief specifies 503 only for POST endpoints) so the songs page renders gracefully pre-configuration.
- **Static serving** is a small custom handler instead of `serveStatic` because it needs `/about` → `about/index.html` resolution, immutable caching for hashed `_astro/` assets, and no SPA fallback — verified by unit test.
- **Songs list dedupe/count** runs client-side using the same `shared/songs.js` module the server could use — one tested implementation.
- Admin guard: 503 when `ADMIN_KEY` isn't configured, 401 for a bad/missing bearer token, timing-safe comparison; CSV export is Excel-friendly (BOM, RFC-style escaping).

## Deliberately left as placeholders (marked for the couple)

- Engagement photos: hero slot, about-page slots (one per person), gallery tiles, wedding-party circles (`✏️ COUPLE:` comments at each spot; `public/gallery/` and `public/wedding-party/` READMEs).
- About-page story paragraphs (warm placeholder text, edit markers around each).
- Registry URLs (`href="#"` with paste-over comments).
- Hotels near Rockmart/Cartersville, driving/parking notes, wedding attire — "details coming soon" blocks.
- RSVP deadline in the FAQ (`[date]`).
