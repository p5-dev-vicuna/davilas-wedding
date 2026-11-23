# BRAND.md — The Davilas style guide

The single source of truth for visual and copy decisions on this site.
Every claim below describes the CURRENT live design (verified against
`public/styles/global.css`, `pages/*.html`, and production). Read it before
any design or copy change. Deviations require owner approval, recorded in
chat. Operational rules (gates, deploys) live in `CLAUDE.md`.

## Color

Palette roles, all defined as custom properties in `public/styles/global.css`
(`:root`). **Colors change via those variables ONLY — hardcoding hex values
in page markup/styles is forbidden** (the favicon SVG and OG templates carry
the hexes as fixed art; that is the sanctioned exception).

| Var                 | Name              | Hex       | Role                                                                                                          |
| ------------------- | ----------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| `--forest`          | Lagoon            | `#243533` | Headings, buttons, footer bg, RSVP card, hero photo scrim                                                     |
| `--sage`            | Moss Mist         | `#4c563f` | Hero sage panel, script accents, labels/smallcaps, favicon ground                                             |
| `--gold`            | Amber Glow        | `#b78953` | Ornament accents, dividers, rules, borders, timeline dots                                                     |
| `--gold-on-forest`  | brightened amber  | `#d9bc8e` | Small marks on dark (footer links, fineprint, M2 band ❦) — plain amber is only 3.7:1 on lagoon; this is 7.1:1 |
| `--rust`            | Crimson Blaze     | `#964734` | Error accents, `aria-invalid` borders — sparingly, never large fills                                          |
| `--oak`             | Maple Spice       | `#692721` | The slim 7px header bar under 1440px — sparingly, never large fills                                           |
| `--cream`           | cream paper       | `#f5f1e8` | Page background — the ONLY light neutral; all body text lives on it                                           |
| `--ink`             | lagoon-tinted ink | `#2b322f` | Body text (11.6:1 on cream)                                                                                   |
| `--placeholder-ink` | muted moss        | `#8d9580` | Form placeholders only — deliberately lighter than entered text                                               |

- Supporting tints (do not invent others): `--cream-deep`, `--white`
  (input bg), `--gold-soft` (50%), `--gold-faint` (18%).
- Owner-tuned, do not touch: `--wash-1/--wash-2` (hero watercolors),
  `--glass-*` (flank panes; owner will retint later).
- Crimson + Maple are a reserved accent pair: error/hover/slim-bar/small
  ornament use only. Never large fills.
- Contrast: body and UI text on cream must pass WCAG AA. Known ratios:
  ink 11.6:1, rust 5.7:1, gold-on-forest 7.1:1 on lagoon.

## Typography

Fonts (Google Fonts, loaded in every page `<head>`):

- `--font-display: 'Cormorant Garamond', …serif` — H1–H4, buttons, labels,
  nav, smallcaps lines.
- `--font-body: 'EB Garamond', …serif` — body copy, `1.0625rem` / 1.7.
- `--font-script: 'Great Vibes', …cursive` — script accents ONLY.

Script rules (the Kendra lesson):

- Short accent lines only — **max one sentence**, never long paragraphs.
- Never uppercase (script + caps is illegible); never on H1/section titles.
- **Never a personal name inside an uppercase heading** — it reads as
  yelling. Guest names render in quiet script under the title
  (`.script.script-guest`, see `pages/address.html`).
- `.hero-script` ("The Davilas", hero overlay) is owner-approved and must
  never change.

Hierarchy (real sizes from `global.css`; clamp min = the mobile scale):

| Element             | Class                              | Size                                               |
| ------------------- | ---------------------------------- | -------------------------------------------------- |
| Hero script overlay | `.hero-script`                     | `clamp(2.6rem, 6vw, 4.2rem)`                       |
| Hero names H1       | `.hero-names`                      | `clamp(1.7rem, 4.4vw, 2.9rem)`, ls 0.24em          |
| H1 / section titles | `.section-title`                   | `clamp(1.6rem, 4vw, 2.3rem)`, uppercase, ls 0.22em |
| Script accent       | `.script-accent`                   | `clamp(1.5rem, 4vw, 1.9rem)`                       |
| In-page sub-heads   | `.section-subtitle`                | `clamp(1.45rem, 3vw, 1.5rem)`                      |
| Callout/note titles | `.callout-title`, `.note-subtitle` | `1.7rem`                                           |
| Smallcaps labels    | `.smallcaps`                       | `0.78rem`, uppercase, ls 0.22em                    |
| Form inputs         | —                                  | `1.05rem` (≥16px: iOS won't zoom on focus)         |

## Spacing & components

- Containers: `.container` = `min(1080px, 92vw)`; `.page-narrow` =
  `min(68ch, 92vw)`; page padding `clamp(2.5rem, 6vw, 4.5rem) 0 4rem`.
- Section rhythm: `margin-top` 2.4–3.2rem between blocks; grid gaps
  1.2–1.4rem; card grids `repeat(auto-fit, minmax(230px, 1fr))`.
- Touch targets: `--tap-min: 44px` on buttons, inputs, lightbox controls.
- Standard components (reuse, don't reinvent):
  - **Page header** (all interior pages): `.page-header` =
    `p.script.script-accent` → `h1.section-title` → `.divider`
    (rule · ❦ · rule) → `p.lede`. **Interior pages have NO full hero** —
    the hero is home-page only.
  - **Cards**: `.card.frame` (gold glyph, uppercase card title, one-line
    sage blurb); `.card.card-rsvp` variant on forest. The gallery landing
    centers exactly three (`.cards-grid.gallery-cards`, max-width 780px).
  - **Callout**: `.callout` — gold-soft border, faint amber wash, ❦ on the
    top edge, centered. **Never put `.callout` and `.frame` on the same
    element** — both style `::before` and the ornament covers the text
    (shipped twice).
  - **Note-box**: `.note-box` (usually `.note-box.frame`) — titled detail
    notes (attire, driving, etc.).
  - **Buttons**: `.btn` (forest bg, cream text, uppercase ls 0.2em,
    min-height 44px; hover → sage bg + gold border) and `.btn-outline`.
  - **Form fields**: `.field` + display-font label, optional `.field-hint`
    (italic) and `.optional` span, input on `--white` with gold-soft border,
    sage focus outline, `.field-error` in `--rust`. Placeholder-muted: add
    `placeholder-muted` to the `<form>` so placeholders use
    `--placeholder-ink` (prompts, not content). State combobox pattern:
    `.state-combobox` wrapping `input[role=combobox]` +
    `ul.state-list[role=listbox]`, behavior in `pages/scripts/state-combobox.js`.
- Decorative language: soft, feathered, tone-on-tone (sage/cream/gold).
  No hard border-on-border, no jewel/clutter accents, no black leading
  lines. Mock new decoration and ask before shipping.

## Imagery & assets

Gallery folders (`public/images/gallery/`, scanned at build/serve time by
`scripts/gallery-sections.mjs`):

- `through-the-years/<year>/his.jpg` + `her.jpg` (2017–2026). A year renders
  only when at least one exists; names match case-insensitively.
- `proposal/` — any `.jpg/.jpeg/.png/.webp` names, numeric-aware order. A
  same-named file in `proposal/thumb/` is used for the grid (lightbox still
  gets the full photo).
- `engagement/` + `engagement/thumb/` — WebP pairs, same basename:
  1800px long edge / 640px wide. Grid tiles are hand-authored in
  `pages/gallery-engagement.html` (copy an existing tile, renumber
  `data-index` 0..n-1).

Asset URL rules:

- Asset URLs in page HTML are **root-absolute** (`/hero.webp`,
  `/images/gallery/engagement/<name>.webp`). Relative refs 404 on nested
  routes (`/gallery/proposal` once shipped unstyled). `og:image` is
  absolute `https://` per spec.
- `bun scripts/build.mjs` masks root-absolute URLs during Bun's bundling
  and restores them verbatim; a post-build assertion counts them — don't
  bypass it. Existing public asset URLs never change (renaming breaks the
  lightbox and shared links).

Favicon & OG cards:

- `public/favicon.svg` — the divider language (amber rule · diamond · amber
  rule) on a moss rounded square, hairline amber inner frame,
  brightened-amber diamond. Mirrored at 180×180 by `public/apple-touch-icon.png`.
- OG cards: 1200×630 PNG per page in `public/og/<page>.png`, generated by
  `bun run gen:og` (`scripts/generate-og.mjs` screenshots
  `scripts/og/og-template.html?label=<Page Title>`). When a page title
  changes: regen AND keep `OG_PAGES` in sync with each page's `og:image`
  meta tag.

## Voice & tone

- Warm, second person ("we can't wait to celebrate with you").
- Em dashes for asides. No all-caps emphasis anywhere (uppercase is a
  typographic treatment set by CSS classes, never shouting in copy).
- Placeholder/example copy uses **Zachary & Kaitlyn Christmas** — never a
  real guest's name (repo is public).
- Canonical strings — copy verbatim, don't reformat:
  - Footer event line: `Saturday, October 23, 2027 · 1513 at Stone Creek · Rockmart, Georgia`
  - Short date: `October 23, 2027` · Venue: `1513 at Stone Creek` ·
    Place: `Rockmart, Georgia` (short form `Rockmart, GA` in tight spots).

## Agent rules

Full operational detail in `CLAUDE.md`; the short list:

1. **Gates before every push**: `bun run lint` && `bun run typecheck` &&
   `bun run build`, then read your diff and describe the change FROM THE
   DIFF.
2. **Verify live after deploy**: hard-refresh
   https://thedavilaswedding.parallel5.com/ and confirm. If stale after
   ~5 min, force-deploy — this Coolify build takes **POST**, not GET.
3. **Never touch**: `--wash-*`, `--glass-*`, `.hero-script` /
   `--font-script`, or any existing public asset URL.
4. **One worker at a time** in the worktree — no parallel agents editing.
5. **Never commit guest data** — names, addresses, phone numbers, tokens.
   The repo is public.
