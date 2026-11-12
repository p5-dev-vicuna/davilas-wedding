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
# PORT=3000
```

- **`DATABASE_URL`** — Neon connection string. Run `schema.sql` once against the
  database (`psql "$DATABASE_URL" -f schema.sql`) to create the `rsvps` and
  `song_requests` tables. **Until this is set, `POST /api/rsvp` and
  `POST /api/song` return 503 with a friendly message** (and `GET /api/songs`
  returns an empty list) — so the site can deploy before credentials exist.
- **`ADMIN_KEY`** — bearer token guarding the admin exports. Requests must send
  `Authorization: Bearer <ADMIN_KEY>`:

  ```bash
  curl -H "Authorization: Bearer $ADMIN_KEY" https://your-host/api/rsvps      # JSON
  curl -H "Authorization: Bearer $ADMIN_KEY" https://your-host/api/rsvps.csv  # spreadsheet
  ```

## API

| Endpoint         | Method | Auth    | Notes                                            |
| ---------------- | ------ | ------- | ------------------------------------------------ |
| `/api/rsvp`      | POST   | —       | Validates server-side (party 1–10, length caps), inserts into `rsvps` |
| `/api/song`      | POST   | —       | Validates (title/artist/name), inserts into `song_requests` |
| `/api/songs`     | GET    | —       | Latest 100 requests; first names only            |
| `/api/rsvps`     | GET    | ADMIN_KEY | All RSVPs as JSON                              |
| `/api/rsvps.csv` | GET    | ADMIN_KEY | All RSVPs as CSV (Excel-friendly)              |

All endpoints are JSON with proper status codes, per-IP in-memory rate limiting
(token bucket), and DB errors are never leaked to clients (logged server-side only).

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

## Preview URLs

Every branch has a predictable preview URL — from any GitHub PR or branch
page you can work it out from the branch name alone, no deploy bot needed:

```
https://davilas-wedding--<sanitized-branch>.preview.parallel5.com
```

`<sanitized-branch>` is the branch name **lowercased**, `/` and `_` become
`-`, any other hostname-unsafe character is stripped, and the result is
capped at **40 characters**:

| Branch               | Preview URL                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `main`               | `https://davilas-wedding--main.preview.parallel5.com`              |
| `bun-native`         | `https://davilas-wedding--bun-native.preview.parallel5.com`        |
| `feature/some_thing` | `https://davilas-wedding--feature-some-thing.preview.parallel5.com` |
| `addresses`          | `https://davilas-wedding--addresses.preview.parallel5.com`         |

`scripts/preview-url.mjs` (Node stdlib only, cross-platform, no dependencies)
does the transform for you:

```bash
node scripts/preview-url.mjs <branch>                    # print the URL
node scripts/preview-url.mjs <branch> --open             # open it in the default browser
node scripts/preview-url.mjs <branch> --register <uuid>  # PATCH the Coolify app's fqdn to the URL
```

`--register` reads `COOLIFY_API_URL` and `COOLIFY_API_TOKEN` from
`~/.hermes/secrets/coolify` — each line is split on the first `=` and values
are used verbatim (the token contains a literal `|`, so nothing is ever
eval'd) — then PATCHes `/api/v1/applications/<uuid>` with the URL as the
`fqdn`, sending `User-Agent: Mozilla/5.0` because Cloudflare blocks default
library UAs.

## Repo layout

```
src/pages/        one .astro page per section (+ 404)
src/layouts/      shared header/nav/footer layout
src/components/   Divider, PhotoSlot
src/styles/       global.css — the whole design system (tokens at the top)
server/           Hono app: API, static serving, rate limiting, env, db
shared/songs.js   dedupe/sort logic shared by browser + server
tests/unit/       Vitest unit tests
tests/e2e/        Playwright specs (data-testid assertions)
schema.sql        Neon Postgres tables
Dockerfile        multi-stage build (node:22-alpine → node:22-slim)
```
