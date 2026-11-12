# BUN-NATIVE REWRITE — branch `bun-native` (Kendra & Nando wedding site)

**READ `BUN_CANARY_NOTES.md` FIRST** — it contains verified facts about the installed Bun canary (bun path on this machine, fullstack dev server API with `Bun.serve({ routes })` + HTML imports + HMR, `bun build --dts`, `bun fmt`/`bun lint`, built-in `sql` from `"bun"`, `bun fmt --staged` for the precommit hook). Do NOT web-search for Bun docs before reading it; WebFetch to bun.com 404s in this environment.

Goal: convert this repo to a fully **Bun-native** stack on the current canary (Bun 1.4.4 canary is installed at `C:\Users\glyph.DESKTOP-F8K8CPE\.bun\bin\bun.exe` — NOT on the default bash PATH, see the notes file). This is an **experiment branch** — `main` stays the deployable Astro version. **Do NOT merge to main. Do NOT deploy.**

Non-negotiable: **zero content, design, or behavior regressions.** Every page, every string of copy, every `data-testid`, every API route and validation rule must behave identically to the Astro version on `main`. The e2e suite passing unchanged is the acceptance test for that.

## Required conversions

1. **Frontend framework**: replace Astro with Bun's native dev server / fullstack mode (`bun dev`, HTML imports, `Bun.serve({ routes })`, built-in HMR). Research the CURRENT canary docs first (`bun.com/docs` — the APIs moved fast in Oct–Nov 2026; verify exact API names before coding). Port all 11 pages (`/`, `/about`, `/rsvp`, `/schedule`, `/travel`, `/details`, `/wedding-party`, `/gallery`, `/faq`, `/registry`, `/songs`) with identical markup/content. Keep the existing CSS design system verbatim (sage/cream tokens, Cormorant Garamond + script font, notched-panel motifs). Keep the vanilla-JS lightbox and form behavior.
2. **Server**: replace Hono with `Bun.serve({ routes })` (bun-native). Preserve every endpoint: `POST /api/rsvp`, `POST /api/song`, `GET /api/songs`, `GET /api/rsvps` + `/api/rsvps.csv` (ADMIN_KEY bearer, timing-safe), per-IP rate limiting, server-side validation with the same error messages and status codes, DB errors never leaked, static files served with real-routes-only (no SPA fallback, styled 404).
3. **Database**: replace `@neondatabase/serverless` with Bun's built-in SQL (`import { sql } from "bun"`, postgres dialect) against `DATABASE_URL` (the pooled Neon endpoint, plain TCP). Keep `schema.sql` as-is. Keep the no-`DATABASE_URL` behavior: clear log warning, POSTs return 503 with the friendly message.
4. **Tests**: port unit tests from Vitest to `bun:test` (`bun test`). Keep Playwright for e2e — run it however works on this machine (bunx or node), same assertions, same `data-testid`s, zero edits to test expectations beyond framework imports. `npm test` may become `bun test`; update scripts and README.
5. **Build**: `bun build --dts` produces the production server bundle + TypeScript declarations. Static assets stay static.
6. **Type-check as an individual script**: `typecheck` in package.json. Prefer Bun's built-in checker if the canary has one (`bun check` — verify in docs); otherwise `tsc --noEmit` invoked through bun. Either way it must be a standalone script that exits non-zero on type errors.
7. **`bun fmt` + `bun lint`**: run `bun fmt` once over the repo (23 files currently need it) and make `bun lint` pass with zero errors. Add minimal `bunfig.toml` config only if needed (e.g., ignore `dist/`, `screenshots/`).
8. **Precommit hook**: git precommit that runs `bun fmt --staged` (auto-fix + re-stage), `bun lint`, and the type-check script — commit blocked if any fails. Use a plain `.git/hooks/precommit` script (no husky dependency — bun-native means fewer deps) committed via `core.hooksPath` (e.g., `.githooks/` + `git config core.hooksPath .githooks`, documented in README) so it survives clones.
9. **package.json scripts** (bun-run): `dev` (bun dev server + HMR), `start` (production: bun runs the built bundle), `build` (bun build --dts), `typecheck`, `lint` (bun lint), `fmt` (bun fmt), `test` (bun test), `test:e2e`. Document each in README.

## Verification (all required before reporting done)

- `bun test` — all unit tests pass (ported from Vitest).
- `bun run test:e2e` — Playwright suite passes **unmodified in its assertions**.
- `bun run build` — build + .d.ts emit cleanly.
- `bun lint` — zero errors. `bun fmt --check` — clean.
- `bun run dev` — dev server serves the site with HMR enabled (verify the HMR websocket/script is present in served HTML).
- Live DB check: with `DATABASE_URL` set (see below), submit an RSVP + song to the running server and confirm rows land in Neon; then DELETE both test rows (cleanup is mandatory — this is a real database the couple will use). Report the actual row counts before/after.
- `core.hooksPath` precommit: stage a deliberately badly-formatted file, attempt commit, confirm the hook blocks it, then `bun fmt --staged` fixes it and the commit succeeds. Report what happened.
- Write `BUN_REWRITE_REPORT.md` with real command output, API differences from the Astro version (should be none), and anything the canary made you work around.

## Environment facts (don't re-derive)

- Windows, git-bash wrapper; use the PowerShell `Remove-Item Env:PWD` trick if a launcher chokes on MSYS paths; double-quote model strings in cmd.
- Bun canary already installed and verified: `bun --version` → 1.4.4, `bun lint` and `bun fmt` functional.
- `DATABASE_URL` for live testing is in `C:/Users/glyph.DESKTOP-F8K8CPE/secrets/neon-wedding` (first `DATABASE_URL="..."` line). Read it from there; never commit it, never print it in the report.
- A preview server from the old stack may still be running on port 3000 — kill any process listening on 3000 before starting yours (`netstat -ano | grep :3000`).
- No external accounts, no deploys, no publishing. Branch `bun-native` only.
