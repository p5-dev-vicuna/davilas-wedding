# The Davilas — Kendra & Nando

Wedding website for **Kendra & Nando**, Saturday · **October 23, 2027** · 1513 at Stone Creek · Rockmart, Georgia.

> **This is the `bun-native` experiment branch.** `main` stays the deployable
> Astro version. This branch replaces the whole stack with Bun built-ins:
> **zero runtime dependencies** — no Astro, no Hono, no Vitest, no database
> driver. Requires a recent **Bun ≥ 1.4.4** (the built-in `bun lint` needs a
> canary; the notes in `BUN_CANARY_NOTES.md` describe this machine's setup).

- **Bun's fullstack server** — `Bun.serve({ routes })` with HTML imports: the
  11 pages + styled 404 live in `pages/*.html` and are bundled by Bun itself
  (on demand with HMR in dev, as a pre-built asset manifest in production).
- **API on the same server** — the five `/api` endpoints are plain route
  handlers with the same validation, rate limiting, admin guard, and CSV
  export as the Astro/Hono version on `main`.
- **Neon Postgres** via Bun's built-in SQL client (`import { SQL } from "bun"}`,
  postgres dialect, plain TCP against the pooled Neon endpoint).
- Vanilla CSS (one stylesheet, design tokens from the couple's save-the-date),
  vanilla-JS lightbox and forms, `data-testid` everywhere the tests look.
- `bun:test` unit tests + Playwright E2E tests (specs byte-identical to `main`).

## Run locally

```bash
bun install
bun run dev        # dev server + HMR on http://localhost:3000
```

Production:

```bash
bun run build      # bun build --target=bun --dts → dist/ (bundle + pages + .d.ts)
bun run start      # cd dist && bun index.js — serves dist manifest + /api
```

## Scripts

| Script                           | What it does                                                               |
| -------------------------------- | -------------------------------------------------------------------------- |
| `bun run dev`                    | Dev server (HTML routes bundled on demand, HMR + browser console relay)    |
| `bun run build`                  | `bun build --target=bun --dts` — production bundle + TypeScript decls      |
| `bun run start`                  | Run the built bundle from `dist/` (pages + API, no runtime bundling)       |
| `bun run typecheck`              | `bun check` — standalone type check, non-zero exit on errors               |
| `bun run lint`                   | `bun lint` — built-in linter (canary), zero errors required                |
| `bun run fmt`                    | `bun fmt` — built-in Prettier-compatible formatter                         |
| `bun test` / `bun run test:unit` | `bun:test` unit run (validation, dedupe/sort, rate limit, live-server API) |
| `bun run test:e2e`               | Builds, serves the production bundle, runs Playwright, tears down          |

For E2E first-time setup, install the browser once: `bun x playwright install chromium`.

## Git hooks (pre-commit)

The quality gate lives in `.githooks/pre-commit` and runs on every commit:
`bun fmt --staged` (auto-format only staged files + re-stage), `bun lint`,
and `bun check`. Any failure blocks the commit. Activate it once per clone:

```bash
git config core.hooksPath .githooks
```

## Environment variables

Copy `.env.example` to `.env` (Bun auto-loads `.env`; the server's tiny loader
also reads it so the built bundle finds it from the repo root). Real env vars
always win.

```ini
DATABASE_URL=postgresql://user:password@ep-...pooler...neon.tech/neondb?sslmode=require
ADMIN_KEY=a-long-random-string
# PORT=3000
```

- **`DATABASE_URL`** — Neon connection string (the **pooled** endpoint — Bun's
  SQL client speaks plain TCP). Run `schema.sql` once against the database
  (`psql "$DATABASE_URL" -f schema.sql`) to create the `rsvps` and
  `song_requests` tables. **Until this is set, `POST /api/rsvp` and
  `POST /api/song` return 503 with a friendly message** (and `GET /api/songs`
  returns an empty list) — so the site can deploy before credentials exist.
- **`ADMIN_KEY`** — bearer token guarding the admin exports. Requests must send
  `Authorization: Bearer <ADMIN_KEY>`:

  ```bash
  curl -H "Authorization: Bearer $ADMIN_KEY" http://localhost:3000/api/rsvps      # JSON
  curl -H "Authorization: Bearer $ADMIN_KEY" http://localhost:3000/api/rsvps.csv  # spreadsheet
  ```

## API

| Endpoint         | Method | Auth      | Notes                                                                 |
| ---------------- | ------ | --------- | --------------------------------------------------------------------- |
| `/api/rsvp`      | POST   | —         | Validates server-side (party 1–10, length caps), inserts into `rsvps` |
| `/api/song`      | POST   | —         | Validates (title/artist/name), inserts into `song_requests`           |
| `/api/songs`     | GET    | —         | Latest 100 requests; first names only                                 |
| `/api/rsvps`     | GET    | ADMIN_KEY | All RSVPs as JSON                                                     |
| `/api/rsvps.csv` | GET    | ADMIN_KEY | All RSVPs as CSV (Excel-friendly)                                     |

All endpoints are JSON with proper status codes, per-IP in-memory rate limiting
(token bucket), and DB errors are never leaked to clients (logged server-side only).

## Where the couple edits things

- **Gallery photos** — drop files into `public/gallery/` and edit the tiles in
  `pages/gallery.html` (`data-full="/gallery/your-file.jpg"` + alt/caption).
  Clicking a tile opens the vanilla-JS lightbox automatically.
- **Wedding party** — edit the `<article class="party-card">` blocks in
  `pages/wedding-party.html` (names, roles, blurbs, photos in
  `public/wedding-party/`).
- **Registry URLs** — in `pages/registry.html`, replace each `href="#"` with
  the real link.
- **Our story / hotels / driving notes / FAQ** — look for the `✏️ COUPLE:`
  HTML comments on each page; they mark exactly what to edit.
- **Hero photo** — instructions in the comment at the top of `pages/index.html`.

## Repo layout

```
pages/              one .html page per route (+ 404.html), served via Bun HTML imports
pages/scripts/      browser scripts referenced by the pages (bundled by Bun)
public/             served verbatim: favicon, styles/global.css, gallery/, wedding-party/
server/             Bun.serve app: routes, API, static/404 fallback, rate limiting, env, db
shared/songs.js     dedupe/sort logic shared by browser + server
tests/unit/         bun:test unit tests (incl. live-server API tests)
tests/e2e/          Playwright specs (data-testid assertions) — identical to main
scripts/            run-e2e.mjs (E2E runner), db-check.mjs (live DB counts/cleanup), shoot.mjs
bunfig.toml         bun test/lint/fmt configuration
tsconfig.json       bun check (typecheck) configuration
schema.sql          Neon Postgres tables (unchanged)
.githooks/          pre-commit hook (activate: git config core.hooksPath .githooks)
BUN_REWRITE_REPORT.md  what changed vs main, verification output, canary workarounds
```

**Not deployed from this branch** — `main` remains the deployable Astro
version. See `BUN_REWRITE_REPORT.md` for the full conversion notes.
