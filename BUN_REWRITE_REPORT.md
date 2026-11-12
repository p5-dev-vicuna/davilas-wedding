# BUN_REWRITE_REPORT — `bun-native` branch

**Status: complete.** Everything in `BUN_REWRITE_BRIEF.md` was implemented and
verified on this machine (Windows, git-bash, Bun canary). Not merged to `main`,
not deployed. Bun: `1.4.4-canary.1+f33631841` (`bun --version` prints `1.4.4`),
at `C:\Users\glyph.DESKTOP-F8K8CPE\.bun\bin\bun.exe` (not on the default bash
PATH — every command below was run with that on PATH).

## What replaced what

| Astro/Hono/Vitest stack (main)                                  | Bun-native stack (this branch)                                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `astro dev` / `astro build` → `dist/` static pages              | `pages/*.html` served via `Bun.serve({ routes })` HTML imports; `bun build --target=bun --dts` emits the production bundle + pages + `.d.ts` |
| Hono app + `@hono/node-server`                                  | `Bun.serve` routes (`{ POST: … }` method handlers) + `fetch` fallback for public/ assets + styled 404                                        |
| `@neondatabase/serverless` HTTP driver                          | Bun built-in `import { SQL } from "bun"` (postgres dialect, plain TCP to the Neon `-pooler` endpoint)                                        |
| Vitest unit tests                                               | `bun:test` (`bun test`)                                                                                                                      |
| eslint/prettier/lint-staged/husky (not present)                 | `bun lint`, `bun fmt` (incl. `--staged`), `.githooks/pre-commit` via `core.hooksPath`                                                        |
| `npm` scripts + package-lock.json                               | `bun` scripts + `bun.lock`                                                                                                                   |
| runtime deps: hono, @hono/node-server, @neondatabase/serverless | **zero** runtime deps (only devDeps: `@playwright/test`, `bun-types`)                                                                        |

## Verification — actual command output

### 1. `bun test` — unit tests (ported from Vitest)

```
$ bun test
 37 pass
 0 fail
 129 expect() calls
Ran 37 tests across 4 files. [75.00ms]
```

37 = the original 36 (validate 12, songs 10, rate-limit 5, api/static 9) + 1
new test (`serves public/ assets (favicon, stylesheet)`). Porting notes:

- `import { … } from 'vitest'` → `from 'bun:test'`; zero assertion edits.
- `tests/unit/api.test.js` was rewritten around a **live ephemeral server**:
  the old suite drove Hono's `app.request()`; the new one boots
  `createApp({ port: 0 })` and issues real HTTP, so the exact route table,
  rate limiting (per-IP via `server.requestIP`), static fallback, and 404s are
  exercised. Same assertions, same expected statuses/messages.
- The old `describe.skipIf(!hasDist)` static-serving guard is gone — pages are
  served from source in any mode, so the test always runs.
- **Bun auto-loads `.env`** (vitest never did), so the suite now scrubs
  `DATABASE_URL` in `beforeAll` (restoring it in `afterAll`) to keep testing
  the exact "deployed before credentials exist" path on a configured machine.

### 2. `bun run test:e2e` — Playwright, specs byte-identical to main

```
$ git diff origin/main -- tests/e2e/ | wc -l
0

$ bun run test:e2e   (against the production bundle in dist/)
  ok 1 [chromium] › tests\e2e\home.spec.js:5:1 › home page loads with the names and wedding date visible (492ms)
  ok 2 [chromium] › tests\e2e\rsvp.spec.js:6:3 › RSVP › happy path: fill and submit the form, see the warm confirmation (949ms)
  ok 3 [chromium] › tests\e2e\rsvp.spec.js:33:3 › RSVP › inline validation catches an empty submit (447ms)
  ok 4 [chromium] › tests\e2e\rsvp.spec.js:45:3 › RSVP › declining shows the gentle regrets message (449ms)
  ok 5 [chromium] › tests\e2e\songs.spec.js:6:3 › Song requests › submitting a song shows it in the live list, deduped by title+artist (478ms)
  ok 6 [chromium] › tests\e2e\songs.spec.js:57:3 › Song requests › inline validation catches an empty submit (401ms)

  6 passed (4.1s)
```

### 3. `bun run build` — production bundle + declarations

```
$ bun run build     # bun build --target=bun --dts --root . --entry-naming "[name].[ext]" server/index.js --outdir dist
dist/index.js                     (server bundle, runs with Bun.serve)
dist/*.html                       (11 pages, pre-built)
dist/*-<hash>.js / *.css / *.svg  (hashed page assets, auto-served from the manifest)
dist/server/*.d.ts, dist/shared/songs.d.ts, dist/pages/scripts/songs.d.ts
```

`bun run start` (`cd dist && bun index.js`) was smoke-tested live (see §7) and
by the whole e2e suite. Because `--dts` type-checks the entry graph first, the
build doubles as a server-side type gate.

### 4. `bun lint` / `bun fmt --check` / `bun run typecheck`

```
$ bun lint --no-script
✓ No problems in 20 files [18.01ms]

$ bun fmt --no-script --check
All 39 files are formatted.

$ bun run typecheck        # bun check (Bun's built-in checker)
✓ No type errors in 12 files [75.45ms]
```

`bun fmt` was run once over the repo (35 files reformatted). Three things are
deliberately excluded from the formatter via `bunfig.toml [fmt] ignorePatterns`
(and stay byte-identical to `main`): `tests/e2e/**` (the brief's acceptance
artifacts) and `public/styles/global.css` (design system kept verbatim —
verified `diff` against `origin/main:src/styles/global.css` → IDENTICAL).

`typecheck` uses Bun's built-in `bun check` (canary) over a minimal
`tsconfig.json` (`checkJs`, `strict`, `noImplicitAny: false`, `bun-types`).
It exits non-zero on errors — demonstrated in §6.

### 5. `bun run dev` — dev server with HMR

```
$ bun run dev        # BUN_DEV=1 bun server/index.js
[server] The Davilas are ready — http://localhost:3000 (pages + /api) [dev · HMR on]

$ curl -s http://localhost:3000/ | grep -o 'data-bun-dev-server-script'
data-bun-dev-server-script          ← HMR client injected
$ curl -s http://localhost:3000/ | grep -oE '/_bun/client/[^"]*\.js'
/_bun/client/index-000000007797b1e5.js
$ curl -s http://localhost:3000/_bun/client/index-000000007797b1e5.js | grep -c "new WebSocket"
2                                   ← it really is the HMR websocket client
```

Pages: `/ /about /rsvp /schedule /travel /details /wedding-party /gallery
/faq /registry /songs` all 200 in dev mode; unknown paths → 404 with the
styled "wandered off" page.

### 6. Precommit hook (`core.hooksPath .githooks`)

`git config core.hooksPath .githooks` is set; `.githooks/pre-commit` runs
`bun fmt --no-script --staged` → `bun lint --no-script` → `bun check`.

**Demo A — badly-formatted staged files (auto-fix path).** Staged
`scripts/db-check.mjs` + a throwaway file with chaotic spacing:

```
$ git commit -m "test: hook demo — badly formatted staged files"
pre-commit: bun fmt --staged
Formatted 2 files, 0 unchanged [128.01ms]
pre-commit: bun lint
✓ No problems in 21 files [15.99ms]
pre-commit: bun check (typecheck)
✓ No type errors in 13 files [67.68ms]
pre-commit: all checks passed.
[bun-native 2cf80e2] test: hook demo — badly formatted staged files
```

The committed file came out Prettier-formatted — `bun fmt --staged` fixed and
re-staged it (this replaces lint-staged), and the commit succeeded.

**Demo B — hook blocks a broken commit.** Staged a file containing
`const count = 5; return count.toUpperCase()`:

```
$ git commit -m "blocked attempt"
pre-commit: bun check (typecheck)
<error file="scripts/hook-block-test.js" line="3" column="16" code="TS2339">
Property 'toUpperCase' does not exist on type '5'. …
Found 1 error in 1 file, checked 14 files [58.89ms]

$ echo $?
1                                   ← commit blocked, HEAD unchanged
```

After fixing the file, the same commit succeeded (exit 0). Both demo files were
removed again (see final commit history).

### 7. Live Neon database check (with cleanup)

`DATABASE_URL` read from `C:/Users/glyph.DESKTOP-F8K8CPE/secrets/neon-wedding`
(first `DATABASE_URL=` line; never printed, never committed). Counts via
`scripts/db-check.mjs` (uses the same built-in SQL client):

```
$ bun scripts/db-check.mjs counts          # BEFORE
[db-check] rsvps=0 song_requests=0

$ (cd dist && bun index.js &)              # production server, live DB
[server] The Davilas are ready — http://localhost:3000 (pages + /api)   ← no 503 warning

$ curl -X POST :3000/api/rsvp -H 'content-type: application/json' -d '{…full marker payload…}'
{"ok":true,"message":"Thank you — your RSVP is in!"}          status=201
$ curl -X POST :3000/api/song -H 'content-type: application/json' -d '{…marker song…}'
{"ok":true,"message":"Thank you — the DJ's notebook grows!"}  status=201

$ curl -s :3000/api/songs
{"songs":[{"title":"Bun Rewrite Verification Song","artist":"The Canary Tests",
           "requestedBy":"Verification","createdAt":"2026-11-12T01:22:57.936Z"}]}
                                     ↑ first-name-only privacy preserved; timestamptz → ISO string

$ curl -X POST :3000/api/rsvp -d '{invalid}'                  # live validation guard
status=422

$ bun scripts/db-check.mjs counts          # AFTER submissions — rows landed
[db-check] rsvps=1 song_requests=1

$ bun scripts/db-check.mjs cleanup         # MANDATORY CLEANUP
[db-check] deleted 1 test RSVP(s), 1 test song(s)
[db-check] rsvps=0 song_requests=0         # database back to its starting state
```

Before/after row counts: **0/0 → 1/1 → 0/0 (after cleanup).**

### 8. Content parity with main (beyond the e2e suite)

- `git diff origin/main -- tests/e2e/` → **0 lines** (specs untouched).
- `public/styles/global.css` byte-identical to `origin/main:src/styles/global.css`.
- Every `data-testid` in main's pages/layout exists in the new pages (checked
  programmatically; array-driven ids were expanded to the same literals):
  gallery tiles 8, party cards/names 10, faq items 6×3, registry cards+links
  3+3, timeline items 4, home cards 8, nav 8×12 pages, footer block ×12.
- All copy/`✏️ COUPLE:` edit comments carried over verbatim.

## API differences from the Astro version

**None in behavior.** Same five endpoints, same validation rules and messages,
same status codes (400/422/429/503/500), same admin bearer guard (timing-safe),
same CSV format (BOM + CRLF), same per-IP token bucket (60/min), same
no-SPA-fallback + styled 404, same "no DATABASE_URL → warn + 503" contract.
Verified by the ported unit tests, the unmodified e2e suite, and the live DB
run above. Cosmetics only: JSON responses come from `Response.json` (charset
spelling can differ from Hono's), and `X-Content-Type-Options: nosniff` is on
static files as before.

## Canary things I had to work around / verify locally

1. **`bun dev` is not a magic dev-server command** on this canary — it just
   runs the `dev` package.json script (verified: with no script it errors
   `Script not found "dev"`; in this repo it originally ran `astro dev`).
   Dev mode is therefore driven by the server itself: `BUN_DEV=1` env +
   `Bun.serve({ development: { hmr: true, console: true } })`. `import.meta.dev`
   does not exist in this canary (printed `undefined`).
2. **Absolute asset paths in HTML are bundler-resolved, not passed through** —
   `/favicon.svg` / `/styles/global.css` in `pages/*.html` failed the build
   ("Could not resolve"). Bundled pages reference `../public/…` relatively
   (bundled + hashed, closest to main's `_astro` hashed assets); only the
   raw-served `pages/404.html` keeps absolute URLs (it is never bundled, and
   it must resolve from any 404'd path).
3. **Inline `<script>` in HTML is served verbatim, not bundled** — so the
   nav/countdown/rsvp/gallery scripts stay inline as plain JS (they have no
   imports), while `pages/scripts/songs.js` (which imports
   `shared/songs.js`) is an external `<script type="module" src>` that Bun
   bundles. This preserves the single shared dedupe/sort implementation.
4. **Production manifests resolve relative to the process CWD**, so
   `bun run start` is `cd dist && bun index.js`. Hashed manifest assets are
   auto-served by Bun.serve (verified 200s on `*.js/*.css/*.svg`).
5. **`bun build --dts` type-checks the whole entry graph** — surfaced real
   `checkJs` issues (implicit-any params, non-narrowed validator returns,
   DOM types in the browser script). Fixed with JSDoc types/casts; runtime
   code paths unchanged. Also required `--root .` (declarations for files
   outside `server/`) and `--entry-naming "[name].[ext]"` to stop duplicate
   `_.._/` output paths. Tests are excluded from `bun check` (runtime
   assertions don't narrow TS unions — same files main never type-checked).
6. **`bun test` also collects `*.spec.*`** → Playwright specs were picked up
   and errored; scoped out via `[test] pathIgnorePatterns = ["tests/e2e/**"]`
   in `bunfig.toml`.
7. **Bun auto-loads `.env`** (vitest didn't) — unit tests scrub
   `DATABASE_URL` (see §1). The tiny `server/env.js` loader is kept so the
   built bundle (run from `dist/`) still finds the repo-root `.env`.
8. **Bun SQL returns plain arrays** of row objects; `new SQL(url)` is lazy
   (no connection until first query); Postgres lowercases unquoted aliases
   (bit me once in the helper script — use snake_case aliases).
9. `bun fmt`/`bun lint` delegate to package.json scripts of the same name —
   the scripts call the built-ins with `--no-script` to avoid recursion.
10. Port 3000 hygiene per the notes: an old `node server/index.js` from the
    Astro stack was still listening at the start (killed via `netstat -ano` +
    `Stop-Process`); every server started during verification was stopped
    afterwards (all ports re-verified free).

## Known/accepted deltas (documented, none observable by the site's tests)

- `/about/` (trailing slash) and `/index.html` now 404 like any unknown path;
  main's static dir-mapping served them. Canonical links never use these.
- Cache headers: main cached hashed `_astro/*` forever; Bun's manifest assets
  carry their own headers, and `public/` files are `no-cache` (main served
  those same files from `dist/` as `no-cache` too).
- `<meta name="generator" content="Astro …">` is gone (Astro-specific tag).
- Unknown `/api/*` paths (e.g. `/api/nope`) no longer consume a rate-limit
  token before 404ing (Hono middleware ran for all `/api/*`).
- The Astro→HTML port duplicates the shared header/footer/nav script across
  the 12 pages (no layout includes in Bun's HTML pipeline). Content edits to
  shared chrome now touch 12 files — the price of zero-framework HTML.
- `Dockerfile`/`.dockerignore` removed on this branch (node-build-based, this
  branch is not deployed; `main` keeps them).

## Files

| Path                                                            | Role                                                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pages/*.html` (+ `pages/scripts/songs.js`)                     | the 12 pages, served via Bun HTML imports                                                           |
| `server/app.js`                                                 | route table (pages + 5 API endpoints), rate limit, admin guard, CSV, `createApp()` for tests        |
| `server/index.js`                                               | entry: env, startup warnings, dev/prod modes, graceful shutdown                                     |
| `server/db.js`                                                  | built-in SQL client, lazy, null-without-`DATABASE_URL` (503 contract)                               |
| `server/static.js`                                              | `public/` file serving (traversal-guarded) + styled 404                                             |
| `server/validate.js`, `server/rate-limit.js`, `shared/songs.js` | unchanged logic (JSDoc types added; validated by the ported tests)                                  |
| `tests/unit/*.test.js`                                          | bun:test ports (api suite = live ephemeral server)                                                  |
| `scripts/run-e2e.mjs`                                           | builds, spawns/stops the exact prod server (bun as `process.execPath`), runs Playwright via `bun x` |
| `scripts/db-check.mjs`                                          | live-DB counts/cleanup helper used in §7                                                            |
| `.githooks/pre-commit`, `bunfig.toml`, `tsconfig.json`          | quality gate + tool config                                                                          |
| `package.json` / `bun.lock`                                     | scripts (dev/start/build/typecheck/lint/fmt/test/test:e2e), zero runtime deps                       |
