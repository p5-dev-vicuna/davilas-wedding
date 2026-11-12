# The Davilas — Kendra & Nando

Wedding website for **Kendra & Nando**, Saturday · **October 23, 2027** · 1513 at Stone Creek · Rockmart, Georgia.

> **Bun-native stack — this is `main`.** The former Astro/Hono/Vitest stack
> was retired when this branch was merged. The whole stack uses Bun built-ins:
> **zero runtime dependencies** — no Astro, no Hono, no Vitest, no database
> driver. Requires a recent **Bun ≥ 1.4.4** (the built-in `bun lint` needs a
> canary; the notes in `BUN_CANARY_NOTES.md` describe this machine's setup).

- **Bun's fullstack server** — `Bun.serve({ routes })` with HTML imports: the
  12 pages + styled 404 live in `pages/*.html` and are bundled by Bun itself
  (on demand with HMR in dev, as a pre-built asset manifest in production).
- **API on the same server** — the eight `/api` endpoints are plain route
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
# SITE_URL=https://your-host   # only scripts/import_guests.mjs reads this
# PORT=3000
```

- **`DATABASE_URL`** — Neon connection string (the **pooled** endpoint — Bun's
  SQL client speaks plain TCP). Run `schema.sql` once against the
  database (`psql "$DATABASE_URL" -f schema.sql`) to create the `rsvps`,
  `song_requests`, and `addresses` tables (existing databases: apply
  `migrations/001_add_addresses.sql` for the addresses table alone). **Until
  this is set, `POST /api/rsvp`, `POST /api/song`, and `POST /api/address`
  return 503 with a friendly message** (and `GET /api/songs` returns an empty
  list) — so the site can deploy before credentials exist.
- **`ADMIN_KEY`** — bearer token guarding the admin exports. Requests must send
  `Authorization: Bearer <ADMIN_KEY>`:

  ```bash
  curl -H "Authorization: Bearer $ADMIN_KEY" http://localhost:3000/api/rsvps        # JSON
  curl -H "Authorization: Bearer $ADMIN_KEY" http://localhost:3000/api/rsvps.csv    # spreadsheet
  curl -H "Authorization: Bearer $ADMIN_KEY" http://localhost:3000/api/addresses    # JSON (matched/unmatched)
  curl -H "Authorization: Bearer $ADMIN_KEY" http://localhost:3000/api/addresses.csv # spreadsheet
  ```

## API

| Endpoint             | Method | Auth      | Notes                                                                 |
| -------------------- | ------ | --------- | --------------------------------------------------------------------- |
| `/api/rsvp`          | POST   | —         | Validates server-side (party 1–10, length caps), inserts into `rsvps` |
| `/api/song`          | POST   | —         | Validates (title/artist/name), inserts into `song_requests`           |
| `/api/songs`         | GET    | —         | Latest 100 requests; first names only                                 |
| `/api/rsvps`         | GET    | ADMIN_KEY | All RSVPs as JSON                                                     |
| `/api/rsvps.csv`     | GET    | ADMIN_KEY | All RSVPs as CSV (Excel-friendly)                                     |
| `/api/address`       | POST   | —         | Validates (required fields, length caps), inserts into `addresses`    |
| `/api/addresses`     | GET    | ADMIN_KEY | Addresses as JSON, grouped `matched` (personal link) / `unmatched`    |
| `/api/addresses.csv` | GET    | ADMIN_KEY | Addresses as CSV (Excel-friendly)                                     |

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

> **Tunnel routing:** per `p5-ops/homelab/DEPLOY.md`, Coolify's default Traefik
> labels may include redirect-to-https / https entrypoints which break tunnel
> routing on this host — if a domain 404s, re-save the labels per the DEPLOY.md
> **Labels** section (no `tls.certresolver`, http entrypoint only).

## Preview URLs

Every branch has a predictable preview URL — from any GitHub PR or branch
page you can work it out from the branch name alone, no deploy bot needed:

```
https://davilas--<sanitized-branch>.parallel5.com
```

The preview subdomain is a **single level** under `parallel5.com` — Cloudflare
Universal SSL only covers one level of subdomain (`*.parallel5.com`, not
`*.*.parallel5.com`), so two-level names like `<branch>.preview.parallel5.com`
fail TLS.

`<sanitized-branch>` is the branch name **lowercased**, `/` and `_` become
`-`, any other hostname-unsafe character is stripped, and the result is
capped at **40 characters**:

| Branch               | Preview URL                                         |
| -------------------- | --------------------------------------------------- |
| `main`               | `https://davilas--main.parallel5.com`               |
| `bun-native`         | `https://davilas--bun-native.parallel5.com`         |
| `feature/some_thing` | `https://davilas--feature-some-thing.parallel5.com` |
| `addresses`          | `https://davilas--addresses.parallel5.com`          |

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
pages/              one .html page per route (+ 404.html), served via Bun HTML imports
pages/scripts/      browser scripts referenced by the pages (bundled by Bun)
public/             served verbatim: favicon, styles/global.css, gallery/, wedding-party/
server/             Bun.serve app: routes, API, static/404 fallback, rate limiting, env, db
shared/songs.js     dedupe/sort logic shared by browser + server
tests/unit/         bun:test unit tests (incl. live-server API tests)
tests/e2e/          Playwright specs (data-testid assertions) — carried over from the Astro version
scripts/            run-e2e.mjs (E2E runner), import_guests.mjs (personal /address links),
                    db-check.mjs (live DB counts/cleanup), shoot.mjs, preview-url.mjs
bunfig.toml         bun test/lint/fmt configuration
tsconfig.json       bun check (typecheck) configuration
schema.sql          Neon Postgres tables (rsvps, song_requests, addresses)
migrations/         incremental schema changes for existing databases (001_add_addresses.sql)
.githooks/          pre-commit hook (activate: git config core.hooksPath .githooks)
BUN_REWRITE_REPORT.md  what changed vs main, verification output, canary workarounds
```

**Deployed from this branch** — pushes to `main` auto-deploy the container
build (`Dockerfile.bun`) to the live site at `davilas.parallel5.com`; every
other branch gets the preview URL described above. See
`BUN_REWRITE_REPORT.md` for the full Astro → Bun conversion notes.
