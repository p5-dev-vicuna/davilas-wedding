# The Davilas — Kendra & Nando

Wedding website for **Kendra & Nando**, Saturday · **October 23, 2027** · 1513 at Stone Creek · Rockmart, Georgia.

- **Astro** static site (one page per section, fully static `dist/` output)
- **Hono** (Node) server that serves the built site **and** the API from one process
- **Neon Postgres** via `@neondatabase/serverless` (HTTP driver — no persistent connections)
- Vanilla CSS, one stylesheet, design tokens from the couple's save-the-date
- Vitest unit tests + Playwright E2E tests (every assertion via `data-testid`)

## Run locally

```bash
npm install
npm run build     # build the static site into dist/
npm start         # serve dist/ + API on http://localhost:3000
```

Other scripts:

| Script              | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Astro dev server (front-end only, no API)                |
| `npm test`          | Vitest unit tests (validation, dedupe/sort, rate limit, API) |
| `npm run test:e2e`  | Playwright E2E (builds, serves, tests, tears down)       |

For E2E first-time setup, install the browser once: `npx playwright install chromium`.

## Environment variables

Copy `.env.example` to `.env` (the server loads it automatically; real env vars win):

```ini
DATABASE_URL=postgresql://user:password@ep-...neon.tech/neondb?sslmode=require
ADMIN_KEY=a-long-random-string
# SITE_URL=https://your-host   # only scripts/import_guests.mjs reads this
# PORT=3000
```

- **`DATABASE_URL`** — Neon connection string. Run `schema.sql` once against the
  database (`psql "$DATABASE_URL" -f schema.sql`) to create the `rsvps`,
  `song_requests`, and `addresses` tables (existing databases: apply
  `migrations/001_add_addresses.sql` for the addresses table alone). **Until
  this is set, `POST /api/rsvp`, `POST /api/song`, and `POST /api/address`
  return 503 with a friendly message** (and `GET /api/songs` returns an empty
  list) — so the site can deploy before credentials exist.
- **`ADMIN_KEY`** — bearer token guarding the admin exports. Requests must send
  `Authorization: Bearer <ADMIN_KEY>`:

  ```bash
  curl -H "Authorization: Bearer $ADMIN_KEY" https://your-host/api/rsvps        # JSON
  curl -H "Authorization: Bearer $ADMIN_KEY" https://your-host/api/rsvps.csv    # spreadsheet
  curl -H "Authorization: Bearer $ADMIN_KEY" https://your-host/api/addresses    # JSON (matched/unmatched)
  curl -H "Authorization: Bearer $ADMIN_KEY" https://your-host/api/addresses.csv # spreadsheet
  ```

## API

| Endpoint             | Method | Auth      | Notes                                            |
| -------------------- | ------ | --------- | ------------------------------------------------ |
| `/api/rsvp`          | POST   | —         | Validates server-side (party 1–10, length caps), inserts into `rsvps` |
| `/api/song`          | POST   | —         | Validates (title/artist/name), inserts into `song_requests` |
| `/api/songs`         | GET    | —         | Latest 100 requests; first names only            |
| `/api/rsvps`         | GET    | ADMIN_KEY | All RSVPs as JSON                              |
| `/api/rsvps.csv`     | GET    | ADMIN_KEY | All RSVPs as CSV (Excel-friendly)              |
| `/api/address`       | POST   | —         | Validates (required fields, length caps), inserts into `addresses` |
| `/api/addresses`     | GET    | ADMIN_KEY | Addresses as JSON, grouped `matched` (via personal link) / `unmatched` (typed manually) |
| `/api/addresses.csv` | GET    | ADMIN_KEY | Addresses as CSV (Excel-friendly)              |

All endpoints are JSON with proper status codes, per-IP in-memory rate limiting
(token bucket), and DB errors are never leaked to clients (logged server-side only).

## Pre-RSVP mailing addresses

The `/address` page lets guests submit their mailing address before invitations
go out (they'll receive a Twilio SMS with a personal link like
`https://your-host/address?g=<token>`; the token is stored silently with the
submission so you can tell exactly who responded).

**Generate the personal links** from a guest CSV with `name` and `phone`
headers (`email` column optional):

```bash
SITE_URL=https://your-host node scripts/import_guests.mjs guests.csv
# → writes guest_tokens.csv: name, phone, token, link
```

(`SITE_URL` may also live in `.env`.) Send each `link` to that guest via SMS.
Unknown tokens are stored as-is — nobody has to keep the list in sync.

**Pull the results** (cross-reference against `guest_tokens.csv`):

```bash
curl -H "Authorization: Bearer $ADMIN_KEY" https://your-host/api/addresses      # JSON, matched/unmatched
curl -H "Authorization: Bearer $ADMIN_KEY" https://your-host/api/addresses.csv  # spreadsheet
```

**Database:** fresh Neon databases can run `schema.sql` as before. Existing
databases (already carrying `rsvps`/`song_requests`) should apply the
incremental migration instead:

```bash
psql "$DATABASE_URL" -f migrations/001_add_addresses.sql
```

## Where the couple edits things

- **Gallery photos** — drop files into `public/gallery/` and update the `photos`
  array at the top of `src/pages/gallery.astro` (filenames map one-to-one to
  tiles, in order). Clicking a tile opens the vanilla-JS lightbox automatically.
- **Wedding party** — edit the single `party` array in the frontmatter of
  `src/pages/wedding-party.astro` (names, roles, blurbs, photos in
  `public/wedding-party/`).
- **Registry URLs** — in `src/pages/registry.astro`, replace each `href: "#"`
  in the `registries` array with the real link.
- **Our story / hotels / driving notes / FAQ** — look for the `✏️ COUPLE:` HTML
  comments on each page; they mark exactly what to edit.
- **Hero photo** — instructions in the comment at the top of `src/pages/index.astro`.

## Deploying on Coolify (one container)

The repo's `Dockerfile` is multi-stage: a Node build stage runs `npm ci` +
`npm run build`, a slim `node:22-slim` run stage installs prod deps only, copies
`server/`, `shared/`, `schema.sql`, and `dist/`, and runs `CMD node server/index.js`.
In Coolify: create a new resource from this Git repo (Dockerfile preset is
auto-detected), set `DATABASE_URL` and `ADMIN_KEY` in the environment tab, expose
the port (Coolify injects `PORT`; the server listens on it, default 3000), and
deploy. Run `schema.sql` against your Neon database once (Neon's SQL editor
works). No other moving parts — one container serves the site and the API.
**Do not** commit `.env`; Coolify holds the real values.

## Repo layout

```
src/pages/        one .astro page per section (+ 404)
src/layouts/      shared header/nav/footer layout
src/components/   Divider, PhotoSlot
src/styles/       global.css — the whole design system (tokens at the top)
server/           Hono app: API, static serving, rate limiting, env, db
shared/songs.js   dedupe/sort logic shared by browser + server
scripts/          import_guests.mjs (guest tokens), run-e2e.mjs, shoot.mjs
tests/unit/       Vitest unit tests
tests/e2e/        Playwright specs (data-testid assertions)
schema.sql        Neon Postgres tables
migrations/       incremental schema changes for existing databases
Dockerfile        multi-stage build (node:22-alpine → node:22-slim)
```
