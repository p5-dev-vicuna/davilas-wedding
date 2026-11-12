# ADDRESS CAPTURE — pre-RSVP mailing addresses (branch: `addresses`, off origin/main)

Purpose: guests receive a Twilio SMS with a personal link; the link opens a page on this site where they submit their mailing address for invitations. Data lands in Neon; the couple exports CSV for the invitation spreadsheet.

## Branch discipline

Work on branch `addresses` (already checked out). Commit there, PUSH the branch to origin when gates pass. Do NOT touch `main`. Do NOT deploy.

## New page — `/address`

- Elegant, consistent with the save-the-date design system (sage/cream, Cormorant + script, notched panels).
- Heading: "Where should we send your invitation?" Script accent above: "Don't lose us in the mail"
- Short helper line: "Beat the RSVP rush — give us your current mailing address now, so your invitation finds you wherever you land."
- Personal token: page reads `?g=<token>` from the URL if present (displayed subtly as "We've got you marked down, <nothing shown>" — actually keep it silent; just persist the token with the submission invisibly). If absent, that's fine — form still works.
- Form fields (each with `data-testid`, labels, inline validation, no horizontal overflow on mobile, 44px+ touch targets per POLISH_REPORT.md standards):
  - Full name(s) (required, text, max 120) — helper: "For the envelope — e.g. 'Fernanda & Alex Davila'"
  - Street address (required, max 200)
  - Apt / unit (optional, max 30)
  - City (required, max 100), State (required, max 50), ZIP / postal code (required, max 20), Country (optional, defaults "USA")
  - Anything we should know? (optional, max 500) — e.g. "we're moving in June"
- Submit → POST `/api/address` → warm success state: "Sealed and delivered — you're on the list. 💌"
- Error states: inline field errors (same pattern as RSVP), first invalid field gets focus.
- Below the form: small link back to RSVP — "Already know you're coming? RSVP here →"
- Footer link added site-wide: "Addresses" → /address (subtle, last position). RSVP page also links to it above the form: "Moved recently? Update your mailing address here →"

## API (server/ — follow the existing patterns exactly)

- `POST /api/address` — server-side validation (required fields, caps per above), rate limiting (reuse the existing token bucket), inserts into `addresses`. Same response shapes/status codes as the RSVP endpoint (422 with per-field messages, 429, 503 without DATABASE_URL, 500 without leaking DB errors).
- `GET /api/addresses` — admin bearer guard (ADMIN_KEY, timing-safe), JSON list, newest first.
- `GET /api/addresses.csv` — admin, CSV export (columns: id, full_name, street, unit, city, state, postal_code, country, notes, guest_token, created_at).
- Update `schema.sql` with:
  `addresses (id serial PK, full_name text NOT NULL, street text NOT NULL, unit text, city text NOT NULL, state text NOT NULL, postal_code text NOT NULL, country text DEFAULT 'USA', notes text, guest_token text, created_at timestamptz NOT NULL DEFAULT now())` + index on guest_token.
  ALSO write `migrations/001_add_addresses.sql` containing just the CREATE TABLE + index, since Neon already has the other tables (the couple applies this incrementally).

## Guest tokens (build the machinery; the list arrives later)

- `scripts/import_guests.mjs` — reads a CSV (headers: name, phone; email optional) via `node scripts/import_guests.mjs guests.csv`, generates a random 8-char token per row, writes `guest_tokens.csv` (name, phone, token, link) where link = `<SITE_URL>/address?g=<token>`. Reads SITE_URL from env. Doc in README.
- Admin `GET /api/addresses` response groups: `matched` (had a token) and `unmatched` (typed manually), plus a `not_yet_responded` count isn't possible without phone numbers client-side — skip; the CSV + guest_tokens.csv let the couple cross-reference.
- `?g=<token>` unknown tokens are fine — store as-is.

## Tests (required)

- Unit: address validation (required fields, caps, ZIP non-empty), admin auth on new endpoints, no-DB 503 behavior.
- E2E: `/address` happy path submit (fill fields, success message visible via `data-testid`), validation failure shows inline errors, token round-trip: load `/address?g=abc123`, submit, admin endpoint returns that row with guest_token abc123 (use the dev server + a test DATABASE_URL or mock consistent with existing e2e setup).
- Gates before reporting done: `npm run build`, `npm test`, `npm run test:e2e` — all pass, zero edits to existing spec assertions.

## Deliverables

- Conventional commits on `addresses`; push branch to origin when green.
- `ADDRESS_FEATURE.md` at repo root: what was built, endpoints, how the couple runs the import and pulls the CSV, real test output.
- Do NOT deploy. Do NOT touch main. DATABASE_URL stays out of the repo; read it from `C:/Users/glyph.DESKTOP-F8K8CPE/secrets/neon-wedding` for any live check, and if you apply the migration live, run the addresses-table creation against Neon and report row count after (should be 0).
