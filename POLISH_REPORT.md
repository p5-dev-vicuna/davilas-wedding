# Polish Report — Impeccable pass on the wedding site

Branch: `impeccable` (based on `main`) · Date: 2026-11-11
Scope: refinement within the sage-and-cream save-the-date design system — **no redesign, no copy changes, no `data-testid` changes, no new dependencies, no framework changes.** Mobile web (320–430px) was the top priority.

---

## 1. How this was audited

- `impeccable context` was run once per the skill's setup; it routed this as a refinement pass over an incumbent visual system (code = design authority).
- The bundled detector was run over all 11 pages at **390×844 (mobile)** and **1280×800 (desktop)** against the built site served by `node server/index.js`.
- Rendered verification was done through Playwright-driven DOM measurement (viewport sweeps at 320/360/375/390/400/414/430/768/1280), because this session's model cannot read images: horizontal-overflow checks, computed tap-target rectangles, computed font sizes/contrast pairs, and live interaction checks (nav open/escape, lightbox open/measure). All numbers below come from those measurements, not from eyeballing.
- Contrast candidates were verified numerically (WCAG relative luminance) before writing CSS.

### Audit health score (before → after)

| # | Dimension | Before | After | Key finding |
|---|-----------|--------|-------|-------------|
| 1 | Accessibility | 2 | 4 | 7 contrast failures (footer links, placeholders, photo-slot labels); 34 sub-11px labels; focus trapped below the fold on invalid form submit |
| 2 | Performance | 3 | 3 | No regressions; `text-wrap` and CSS-grid countdown are cheaper than the flex-wrap orphan layout |
| 3 | Theming | 3 | 4 | Two contrast fixes became tokens (`--gold-on-forest`, `--tap-min`); one stray value (placeholder color) now uses `--sage` |
| 4 | Responsive Design | 2 | 4 | 6 touch-target groups below 44px; countdown orphan cell at 375–430px; lightbox arrows crowding the photo; no horizontal overflow at any width (before and after) |
| 5 | Implementation Integrity | 3 | 4 | Inline `style="font-size:1.3rem"` sub-headings promoted to a `.section-subtitle` scale step; detector drift findings all resolved except two pinned-brand advisories |
| | **Total** | **14/20** Good | **19/20** Excellent | Remaining item is the deliberate cream/letterpress world (see below) |

### Detector results (per pass, all 11 pages)

| Pass | Total | Breakdown |
|------|-------|-----------|
| **Before, 390×844** | **102** | low-contrast ×20 · undersized-ui-text ×34 · straggler ×19 · cream-palette ×11 · repeating-stripes-gradient ×11 · unbalanced-heading ×1 · flat-type-hierarchy ×2 · wide-tracking ×4 |
| **Before, 1280×800** | **84** | low-contrast ×20 · undersized-ui-text ×34 · cream-palette ×11 · repeating-stripes-gradient ×11 · line-length ×3 · straggler ×1 · wide-tracking ×4 |
| **After, 390×844** | **22** | cream-palette ×11 · repeating-stripes-gradient ×11 (both intentional — see below) |
| **After, 1280×800** | **22** | cream-palette ×11 · repeating-stripes-gradient ×11 |

**Intentional exceptions (documented, not defects):** `cream-palette` and `repeating-stripes-gradient` flag the letterpress cream paper (`--cream: #f5f1e8`) and its subtle dot/hatch texture. BRIEF.md pins both: *"cream paper, sage panel, forest ink… letterpress invitation turned into a website."* Per the skill, the brief wins over saturated-pattern warnings; both stay.

---

## 2. What changed

### Design-system fixes (`src/styles/global.css`)

**Contrast (WCAG AA)**
- Footer links & fineprint: gold `#a89968` on forest measured **3.9:1** → new token `--gold-on-forest: #cdbf94` at **6.0:1**. The gold family is unchanged everywhere else.
- Photo-slot labels: `--sage` on the light gradient measured **4.4:1** → `--forest` (**7.6:1**); the hero's sage slot label went from 90%-opaque cream (**4.0:1**) to `--white` (**5.0:1**).
- Form placeholders: UA default `#757575` on white measured **4.49:1** → `::placeholder { color: var(--sage) }` (**6.3:1**), `opacity: 1`.

**Legibility floors**
- `.photo-label` 0.68rem (10.9px) → 0.75rem (12px); `.count-unit` 0.66rem (10.6px) → 0.74rem (11.8px); `.party-role` 0.68rem → 0.74rem (tracking eased 0.22em → 0.18em to hold the line width).
- Form labels: tracking 0.1em → 0.04em (detector `wide-tracking`), size 0.86 → 0.88rem.

**Touch targets (`--tap-min: 44px` token)** — measured before → after at 390px:

| Control | Before | After |
|---|---|---|
| Nav toggle (☰) | 37×34 | **44×44** |
| Header RSVP button | 80×39 | **80×44** |
| Monogram link | 104×39 | **104×51** |
| Footer links (Song Requests / FAQ) | 120×21 / 29×21 | **139×46 / 49×46** |
| Mobile menu rows | 345×41 | **345×54** |
| All `.btn` (submits, registry, venue, 404) | 39–41px tall | **≥44px** (`min-height`, inline-flex centering, `:active` press feedback) |
| Lightbox close / prev / next | ~41×45 | **≥44×44** |
| Radio inputs (under a finger) | 17×17 | 20×20 + 0.55rem-padded labels via `@media (hover: none)` |

**Typography & rhythm**
- Reading measure: `.page-narrow` 720px → `min(68ch, 92vw)` (the About paragraphs measured ~108–111 chars/line at desktop).
- Sub-heading scale: inline `style="font-size:1.3rem"` h2s on Songs/Travel promoted to `.section-subtitle { clamp(1.45rem, 3vw, 1.5rem) }`; the type hierarchy step went from 1.19:1 to ≥1.26:1 (detector `flat-type-hierarchy` cleared).
- `h1–h4 { text-wrap: balance }`, `main p { text-wrap: pretty }` — clears the widow/straggler findings (including the lone `❦` the fineprint used to strand) without touching copy. The footer event line uses `pretty`, not `balance` (balance produced 3 lines at 320px; pretty keeps 2).

**Mobile layout**
- Countdown: flex-wrap orphan row (3 cells + 1 at 375–430px) → CSS grid, **2×2 on phones, 4-up ≥560px**.
- Lightbox on ≤560px: prev/next move from the photo's sides to a **thumb-reachable bottom pair** (clear of the art and caption, `env(safe-area-inset-bottom)`-aware); art capped at 60vh so caption + controls never collide. Desktop lightbox is unchanged (side arrows, 70vh).
- Lightbox placeholder art no longer shrinks to caption width inside the centering grid (`min-width: min(320px, 76vw)` on the figure).
- Cards: `:focus-visible` now gets the same lift as hover, with a visible dashed outline.
- `viewport-fit=cover` + footer `padding-bottom: max(2.2rem, env(safe-area-inset-bottom))` for notched phones; `theme-color: #f5f1e8` and `color-scheme: light` so browser chrome and native controls match the paper world; `scroll-padding-top` keeps anchors clear of the sticky header; `-webkit-tap-highlight-color: transparent` on interactive elements.

### Page-level fixes

- **`src/layouts/Base.astro`** — `viewport-fit=cover`, `theme-color` meta; **Escape closes the mobile menu** and returns focus to the toggle (`aria-expanded` kept in sync).
- **`src/pages/rsvp.astro`** — `inputmode="numeric"` on party size (numeric keypad on phones); on failed validation, **focus moves to the first invalid field** instead of staying at the submit button; `aria-invalid` now also reaches the radio group (fieldset controls have no element id — falls back to `[name=…]`).
- **`src/pages/songs.astro`** — same focus-first-invalid behavior; sub-heading moved onto the `.section-subtitle` scale.
- **`src/pages/travel.astro`** — sub-headings ("Where to Stay", "Driving Notes") moved onto the `.section-subtitle` scale.

### Per-page summary

| Page | Changes |
|---|---|
| Home | Countdown 2×2 grid, label sizes ≥11.8px, hero photo-label contrast, balanced hero names, safe-area/theme-color, tap targets (header/footer/nav toggle), `:active`/focus states |
| About | Measure capped at 68ch; balanced h2 (the "Celebrate" heading no longer strands one short word); photo labels 12px/7.6:1 |
| RSVP | Focus-first-invalid, numeric keypad, radio targets under `(hover: none)`, placeholder contrast 6.3:1, labels de-tracked, submit ≥44px |
| Songs | Focus-first-invalid, placeholder contrast, sub-heading on the shared scale, list area unchanged |
| Schedule | Widow-aware timeline notes; nav/footer tap targets; safe-area footer |
| Travel | Sub-headings on the shared scale (fixes the 1.19:1 hierarchy step at 390px); venue button ≥44px |
| Details | Nav/footer tap targets, contrast, safe-area footer |
| Wedding Party | Role labels 11.8px (was 10.9px); photo labels 12px/7.6:1; balanced blurbs |
| Gallery | Lightbox bottom-nav pair ≤560px, ≥44px controls, full-size placeholder art; tile focus lift |
| FAQ | Nav/footer tap targets; balanced headings; contrast |
| Registry | Registry buttons ≥44px with press feedback; footer contrast |
| 404 | Home button ≥44px |

### Constraints honored

- **Zero copy changes** — not a single text node changed (only CSS and behavior).
- **Zero `data-testid` changes** — no testid was added, removed, or renamed (`git diff` confirms; one accidentally-added testid was caught and reverted during the pass).
- **No new dependencies, no framework changes** — vanilla CSS + the existing Astro/Hono stack only.
- **Zero spec edits** — `tests/` is untouched; all viewport-conditional behavior lives in CSS media queries and page scripts.

---

## 3. Before / after notes

- **Detector (mobile):** 102 → 22 findings; every non-brand rule cleared. Desktop: 84 → 22.
- **Contrast failures:** 20 per pass → 0 (placeholder, footer-link, and photo-label fixes verified numerically: 6.3:1, 6.0:1, 7.6:1, 5.0:1).
- **Sub-11px functional text:** 34 instances → 0.
- **Touch targets below 44px:** 7 control groups → 0 (raw radio inputs remain 20px under a finger but sit inside 48px+ padded labels — the label is the tap target, standard native pattern).
- **Countdown at 375–430px:** 3+1 orphan row → tidy 2×2.
- **Fineprint on phones:** lone `❦` on its own line → balanced two-line (or single-line at 430px) break.
- **Lightbox on phones:** arrows overlapping the photo's sides → bottom pair, 44px, clear of art and caption; placeholder no longer caption-width.
- **Invalid form submit:** focus stayed on the submit button → focus lands on the first invalid field; radio group now gets `aria-invalid`.
- **Horizontal overflow:** none at any tested width (320–430, 768, 1280) — true before and after; kept clean.

---

## 4. Verification gates (real command output)

All three gates ran after the final state of the working tree. Spec files were not modified (`git status` shows only `src/` files changed).

### `npm run build` — exit 0

```
[build] 12 page(s) built in 1.16s
[build] Complete!
```

### `npm test` — exit 0

```
 RUN  v3.2.7 C:/Users/glyph.DESKTOP-F8K8CPE/projects/davilas-wedding

  ✓ tests/unit/rate-limit.test.js (5 tests) 4ms
  ✓ tests/unit/validate.test.js (12 tests) 6ms
  ✓ tests/unit/songs.test.js (10 tests) 16ms
  ✓ tests/unit/api.test.js (9 tests) 24ms

  Test Files  4 passed (4)
       Tests  36 passed (36)
```

### `npm run test:e2e` — exit 0 (zero edits to spec assertions)

```
Running 6 tests using 1 worker

  ok 1 [chromium] › tests\e2e\home.spec.js:5:1 › home page loads with the names and wedding date visible (459ms)
  ok 2 [chromium] › tests\e2e\rsvp.spec.js:6:3 › RSVP › happy path: fill and submit the form, see the warm confirmation (832ms)
  ok 3 [chromium] › tests\e2e\rsvp.spec.js:33:3 › RSVP › inline validation catches an empty submit (325ms)
  ok 4 [chromium] › tests\e2e\rsvp.spec.js:45:3 › RSVP › declining shows the gentle regrets message (381ms)
  ok 5 [chromium] › tests\e2e\songs.spec.js:6:3 › Song requests › submitting a song shows it in the live list, deduped by title+artist (422ms)
  ok 6 [chromium] › tests\e2e\songs.spec.js:57:3 › Song requests › inline validation catches an empty submit (386ms)

  6 passed (3.6s)
```

### Detector re-run (final)

```
impeccable detect --viewport 390x844  <11 pages>  → 22 findings {cream-palette:11, repeating-stripes-gradient:11}
impeccable detect --viewport 1280x800 <11 pages>  → 22 findings {cream-palette:11, repeating-stripes-gradient:11}
```

(Both remaining rules flag the brief-pinned cream letterpress world — intentional.)

---

## 5. Known gaps / notes for the couple

- Placeholder photo slots are the live reality until engagement photos land; their labels now meet contrast/size floors, and the gallery lightbox shows a full-size placeholder.
- Radio inputs themselves are 20px on touch devices (48px+ padded label is the tap target) — native pattern, passes WCAG 2.5.8 via the label.
- Recommended follow-up: `/impeccable init` to capture PRODUCT.md (the context loader flagged it as missing); not done here since this was a scoped polish pass.
