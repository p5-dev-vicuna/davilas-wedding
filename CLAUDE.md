# CLAUDE.md — rules for AI assistants working on davilas-wedding

This file exists because AI-assisted changes broke production twice in one day.
Every rule below traces to a real incident. Follow them; they are short.

## The two rules that prevent every incident so far

1. **Never push without running the gates AND looking at your diff.**
   - Gates: `bun run lint` && `bun run typecheck` && `bun run build` — all must pass.
   - Then `git status` + `git diff --stat` and describe your change FROM THE DIFF.
     Do not describe what you intended to do. (Incident: commit `769967c` claimed
     "gallery shows engagement favorites only" but only added 2 files — the markup
     was never edited.)
2. **Never say "deployed" or "done" without verifying on the live site.**
   After pushing, open the site (hard refresh) and confirm the change is visible.

## Repo facts you must not re-derive wrongly

- Stack: Bun.serve + Bun built-in SQL. `server/app.js` imports `pages/*.html`,
  so **Bun's HTML bundler processes asset URLs in the markup at build time**.
  Build = `bun scripts/build.mjs` (masks root-absolute asset URLs like
  `/hero.webp` during bundling and restores them verbatim — public URLs must
  never change; a post-build assertion counts them, don't bypass it).
- Static assets live in `public/` and are served at the URL root
  (`/hero.webp`, `/gallery/<name>.webp`, `/gallery/thumb/<name>.webp`).
- Production: pushes to `main` auto-deploy via Coolify (~1–3 min) **but the
  webhook has silently missed pushes**. A push is not a deploy — see Deploying.
- Canonical prod URL: **https://thedavilaswedding.parallel5.com/**
  (`davilas.parallel5.com` also serves).

## Adding / removing gallery photos

1. Convert photos to WebP first:
   - lightbox size: 1800px on the long edge → `public/gallery/<name>.webp`
   - grid thumbnail: 640px wide → `public/gallery/thumb/<name>.webp`
   - same basename in both directories. Do not invent sizes.
2. Add ONE `<button>` tile per photo in `pages/gallery.html` — copy an existing
   tile exactly (structure/classes), set `src="/gallery/thumb/<name>.webp"` and
   `data-full="/gallery/<name>.webp"`.
3. **Renumber `data-index` 0..n-1 across ALL tiles** — the lightbox prev/next
   breaks if the sequence has gaps.
4. Removing a photo = delete its tile AND both `.webp` files, then renumber.
5. Gates (rule 1), then serve and LOOK at the gallery before pushing:
   `cd dist && bun index.js` → open /gallery → every tile shows an image.

## Making any other change

- Gates first (rule 1). If `bun run build` fails, do not push and do not
  describe the change as complete.
- **Do not touch, "clean up", or restyle:**
  - `.hero-script` / `--font-script` — the "The Davilas" script font is owner-
    approved and must never change (verified against production if in doubt).
  - `--wash-1/--wash-2` (hero watercolor washes) and `--glass-*` (flank pane
    colors) — owner-tuned; the owner has said he will retint `--glass-*` later,
    so keep them as CSS custom properties, never hardcode.
  - Existing public asset URLs (renaming/hashing breaks the gallery lightbox
    and shared links).
- Decorative language of this site is **soft, feathered, tone-on-tone**
  (sage/cream/gold). No hard borders-on-borders, no jewel/clutter accents, no
  black leading lines. If adding decoration, mock it first and ask.
- Do not put `.callout` and `.frame` classes on the same element — both style
  `::before` and the ornament stretches into a cream block that covers the text
  (this bug has shipped twice).

## Deploying (after pushing to main)

1. Wait ~3 min, then hard-refresh https://thedavilaswedding.parallel5.com/ and
   confirm your change is visible.
2. If stale after ~5 min the auto-deploy was missed: force it from the Coolify
   UI (open the davilas-wedding app → Deploy, force/rebuild) or via API:
   `GET https://coolify.parallel5.com/api/v1/deploy?uuid=ocged1iwh5w7lhnhapsh7jg5&force=true`
   (Bearer token required).
3. A **failed deploy is not downtime** — the old container keeps serving. Read
   the failed deployment's log tail in Coolify to find the failing step, fix,
   re-push, force-deploy.
4. Both hostnames serve production: thedavilaswedding.parallel5.com (canonical)
   and davilas.parallel5.com. Verify the one you advertised.

## Known pre-existing noise (not your bug)

- `bun test`: `tests/unit/api.test.js` may fail locally ("serves pages for real
  routes" / dev-bundler resolve of `/hero.webp`) — reproduces on a pristine
  checkout. Everything else should pass.
