# Wedding Website — Kendra & Nando ("The Davilas")

Build a complete, deployable wedding website. This brief is the source of truth; implement everything it names. When something is unspecified, choose the simplest option that fits the design system below.

## Stack decisions (fixed)

- **Astro** static site (one page per section, shared layout) — output fully static.
- **Submissions backend**: a single tiny **Hono** server (Node) in the same repo that serves the built static files AND exposes the API endpoints. One container on Coolify, no other moving parts.
- **Database**: **Neon Postgres** via `@neondatabase/serverless` (HTTP driver — no persistent connections). Connection string comes from `DATABASE_URL` env var. Provide `.env.example` and a `schema.sql` that creates the tables. Code must handle the DB not being configured yet (log clearly, return 503 on POST endpoints) so the site can deploy before creds exist.
- **No other frameworks.** Vanilla CSS (one stylesheet, CSS custom properties for the design tokens). No Tailwind, no React islands.

## Design system (from the couple's save-the-date — follow this closely)

Vibe: elegant, classic, botanical-paper. Think letterpress invitation turned into a website.

- Colors:
  - `--cream: #f5f1e8` (page background, slightly textured feel)
  - `--sage: #5a6152` (deep sage/olive panel color, from the save-the-date side panel)
  - `--forest: #2e4038` (dark green — headings, primary text accents)
  - `--ink: #33342e` (body text)
  - `--gold: #a89968` (thin rules, small accents, hover states)
- Typography:
  - Display/serif: **Cormorant Garamond** (headings, couple names, section titles) — uppercase with generous letter-spacing (0.15em–0.25em) for names and section headers, like "K E N D R A & N A N D O" on the card.
  - Script accent: **Great Vibes** or similar calligraphy Google font for romantic accents ("Save the Date", "formal invitation to follow", pull-quote lines).
  - Body: Cormorant Garamond or **EB Garamond** for readability.
  - Load via Google Fonts with `font-display: swap`.
- Motifs: thin 1px white/gold borders with small corner-notch detail (like the card's notched panel frame); the save-the-date's split layout (sage photo panel left, cream text panel right) is the hero layout; generous whitespace; section dividers as short centered gold rules with a small botanical glyph (❦ or similar).
- Fully responsive; mobile-first. Sticky top nav on desktop, hamburger or simple wrapped nav on mobile.
- Accessibility: real contrast (forest on cream passes), focus states, labels on all form fields, semantic landmarks.

## Site structure

Nav tabs (exact order): Home · Get to Know Us · Gallery · Wedding Party · Wedding Details · Schedule · Travel · Registry.
**RSVP is NOT a nav tab** — it is a standout header button (sage/forest, opposite the nav) on every page. Songs (`/songs`) is linked from the RSVP page (below the form: "Got a song that'll fill the dance floor? Request it here") and in the footer. FAQ (`/faq`) is linked in the footer only.

1. **Home** (`/`) — hero recreating the save-the-date split layout: sage panel with a photo placeholder slot (they'll drop engagement photos in later — use tasteful `placeholder` blocks with instructions in a comment) and script "The Davilas"; cream panel with "SAVE THE DATE", "KENDRA & NANDO", "OCTOBER 23, 2027", "ROCKMART, GA", script "formal invitation to follow". Below the fold: a countdown to the date, short welcome paragraph, and cards linking to each section.
2. **Get to Know Us** (`/about`) — the couple's story: how we met, the proposal, and "we can't wait to celebrate with you". Content is a placeholder the couple will fill in — write 2–3 short warm paragraphs of tasteful placeholder text with an HTML comment marking exactly where to edit, plus two photo slots (one per person or one shared).
3. **RSVP** (`/rsvp`) — form posting to `POST /api/rsvp`. Fields:
   - Full name (text, required) — the couple will match against their guest list manually; no plus-ones, so no guest-count field.
   - Will you attend? (radio: Joyfully accept / Regretfully decline, required)
   - DIRECTLY above the form fields, a clearly visible but warm callout box: "A quick note on guests: invitations are for you only unless we've personally told you otherwise. We love your people, but our guest list is set — we appreciate you understanding!" Make sure it reads as affectionate, not scolding.
   - Number in your party (integer 1–10, required, default 1, labeled "Number in your party, including you")
   - Food allergies or dietary restrictions (textarea, optional — explicitly labeled "so we can keep you safe and fed")
   - Song request for the reception (optional text — primes the songs feature)
   - Anything else we should know? (optional textarea)
   - Success state: warm confirmation message. Error state: inline validation messages. **Include a `data-testid` on every form field, button, and success/error message.**
4. **Schedule** (`/schedule`) — Schedule of Events page: October 23, 2027, 1513 at Stone Creek, Rockmart, GA. Timeline: 4:00 PM Cocktail Hour · 5:00 PM Ceremony · 6:30 PM Reception · late. Render as an elegant vertical timeline. Note "Wedding Attire: details coming soon — check back for guidance on what to wear."
5. **Travel** (`/travel`) — venue address with a link to Google Maps, placeholder sections for hotels near Rockmart/cartersville area (marked "details coming soon"), and driving notes placeholder.
6. **Wedding Details** (`/details`) — the adults-only note ("We love your little ones, but this will be an adults-only celebration. Thank you for understanding!"), attire note, and placeholder blocks for anything else the couple adds later.
7. **Wedding Party** (`/wedding-party`) — elegant grid of party member cards: circular photo slot, name, role/title, and a one-line blurb. Include the standard roles (Maid of Honor, Best Man, Bridesmaids, Groomsmen, plus any others that fit) with clearly-marked placeholder names ("Name Here") and a comment block explaining where to edit names/photos/descriptions — make this page trivially editable from one data array in the page's frontmatter.
8. **Gallery** (`/gallery`) — responsive masonry-ish grid with 6–8 placeholder tiles and a comment block explaining exactly where to drop photos (`public/gallery/`) and how filenames map to tiles. Lightbox on click (vanilla JS, no library).
9. **FAQ** (`/faq`) — accordion (details/summary styled, no JS needed): include starter Q&As — adults-only policy, plus-ones (no), attire (coming soon), parking/venue access (placeholder), song requests pointer, RSVP deadline placeholder ("please RSVP by [date]").
10. **Registry** (`/registry`) — warm note that presence is the greatest gift, then placeholder registry cards (Amazon / Target / Honeymoon fund) linking to `#` with a clear comment for the couple to paste real URLs.
11. **Songs** (`/songs`) — song-request form posting to `POST /api/song`: song title (required), artist (required), your name (required). Below the form, a live "Requests so far" list fetched from `GET /api/songs` (dedupe by lowercase title+artist, show count). `data-testid` on all fields and the list.

Every page: consistent header (script monogram "The Davilas" + nav), footer with names/date/venue and a small "Questions? Reach out to Kendra & Nando" line.

## API (Hono server, `server/` directory)

- `POST /api/rsvp` — validate server-side (required fields, party size 1–10, lengths capped: name 120, allergy text 500, notes 1000, song 200). Insert into `rsvps`.
- `POST /api/song` — validate (title 200, artist 200, name 120). Insert into `song_requests`.
- `GET /api/songs` — public; returns recent 100 requests (title, artist, first name only, created date).
- `GET /api/rsvps` — **admin**, guarded by `ADMIN_KEY` env (bearer token in `Authorization` header); returns all RSVPs as JSON, plus a `GET /api/rsvps.csv` for a spreadsheet export.
- All endpoints: JSON, proper status codes, basic rate limiting per IP (simple in-memory token bucket is fine), and never leak DB errors to clients.
- Serve the built `dist/` statically with SPA-fallback disabled (real routes only).

## Database (`schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS rsvps (
  id serial PRIMARY KEY,
  full_name text NOT NULL,
  attending boolean NOT NULL,
  party_size integer NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 10),
  allergies text,
  song_request text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS song_requests (
  id serial PRIMARY KEY,
  title text NOT NULL,
  artist text NOT NULL,
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## Tests (required)

- Unit tests (Vitest) for all API validation logic and the songs dedupe/sort logic.
- Playwright E2E: home page loads with names/date visible; RSVP happy path fills and submits (mock or real server in CI mode); songs form submits and the request appears in the list. Every assertion uses `data-testid`.
- `npm test` runs unit tests; `npm run test:e2e` runs Playwright. Both must pass before you report done.

## Deliverables & definition of done

- Git repo initialized here with a clean initial commit (conventional message, e.g. `feat: initial wedding site for Kendra & Nando`).
- `npm run build` produces a working static `dist/`; `npm start` serves it plus the API locally on port 3000.
- `README.md`: how to run locally, how to set `DATABASE_URL` + `ADMIN_KEY`, where to drop gallery photos, where to paste registry URLs, and a one-paragraph Coolify deploy note (Dockerfile: multi-stage — node build stage, slim run stage, `CMD node server/index.js`).
- Write `BUILD_REPORT.md` at the repo root: what was built, files of interest, test results (actual output), and anything deliberately left as a placeholder.
- Do NOT deploy anything. Do NOT create external accounts. Local verification only.
