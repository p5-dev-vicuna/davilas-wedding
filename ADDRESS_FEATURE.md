# Address Capture — Delivered

Pre-RSVP mailing-address capture for The Davilas, per `ADDRESS_FEATURE_BRIEF.md`.
Branch: `addresses` (off `origin/main`). Not deployed; `main` untouched.

## What was built

### `/address` page (`src/pages/address.astro`)

- Save-the-date design system throughout: sage/cream palette, Cormorant labels,
  Great Vibes script accent ("Don't lose us in the mail") above the heading
  "Where should we send your invitation?", notched panels via the existing
  `.callout`/`.success-box` components, shared `Divider`.
- Helper line: "Beat the RSVP rush — give us your current mailing address now,
  so your invitation finds you wherever you land."
- Fields, each with a `data-testid`, label, inline validation, and 44px+ touch
  targets (global form controls now carry `min-height: 44px`):

  | Field          | Required | Cap | testid            |
  | -------------- | -------- | --- | ----------------- |
  | Full name(s)   | yes      | 120 | `address-name`    |
  | Street address | yes      | 200 | `address-street`  |
  | Apt / unit     | no       | 30  | `address-unit`    |
  | City           | yes      | 100 | `address-city`    |
  | State          | yes      | 50  | `address-state`   |
  | ZIP / postal   | yes      | 20  | `address-zip`     |
  | Country        | no (USA) | 100 | `address-country` |
  | Notes          | no       | 500 | `address-notes`   |

  City/State/ZIP sit in a responsive grid (`address-city-row`): one column on
  phones (no horizontal overflow), three columns ≥640px. Name carries the
  helper "For the envelope — e.g. 'Fernanda & Alex Davila'".

- Silent personal token: `?g=<token>` from the URL is read client-side,
  never rendered, capped at 64 chars, and sent as `guest_token` with the
  submission. No token → form works fine, token stored as `null`.
- Errors follow the RSVP pattern exactly: inline `address-<field>-error`
  elements + `address-form-error`, `aria-invalid` on inputs, and the first
  invalid field is focused on failed submit (client or 422).
- Success: warm box with "Sealed and delivered — you're on the list. 💌"
  (displayed from the API response message).
- Below the form: "Already know you're coming? RSVP here →".
- Site-wide: footer gains a subtle "Addresses" link (last position); the RSVP
  page links to it above the form ("Moved recently? Update your mailing
  address here →").

### API (`server/` — same patterns as the RSVP endpoints)

| Endpoint             | Method | Auth      | Behavior                                                                                                                                                                                                                        |
| -------------------- | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/address`       | POST   | —         | Server-side validation (required fields + caps above), shared token-bucket rate limit, insert into `addresses`. 400 non-JSON, 422 per-field errors, 429, 503 without `DATABASE_URL`, 500 with DB errors logged server-side only |
| `/api/addresses`     | GET    | ADMIN_KEY | Timing-safe bearer guard; JSON newest-first, grouped `matched` (had a token) / `unmatched` (typed manually) + `count`                                                                                                           |
| `/api/addresses.csv` | GET    | ADMIN_KEY | CSV export, columns: `id,full_name,street,unit,city,state,postal_code,country,notes,guest_token,created_at`; BOM + CRLF for Excel                                                                                               |

Validation lives in `validateAddress` (`server/validate.js`) with exported
`ADDRESS_LIMITS`, mirroring `validateRsvp`/`validateSong` (unknown tokens are
accepted as-is; empty `country` defaults to `'USA'`).

### Database

- `schema.sql` now includes `addresses` (id serial PK, text columns per brief,
  `country text DEFAULT 'USA'`, `created_at timestamptz NOT NULL DEFAULT now()`)
  plus `addresses_guest_token_idx`.
- `migrations/001_add_addresses.sql` contains just the CREATE TABLE + index for
  incremental application to the existing Neon database.
- **Applied live:** `migrations/001_add_addresses.sql` was run against Neon
  (DATABASE_URL read from the local secrets file, never committed). Result:

  ```
  migration applied — addresses row count: 0
  ```

### Guest tokens (`scripts/import_guests.mjs`)

- `node scripts/import_guests.mjs guests.csv` (headers: `name, phone`; `email`
  column optional) → generates a random 8-char token per row from an
  unambiguous alphabet (no 0/O/1/l/i) via `crypto.randomBytes`, collides-checks,
  and writes `guest_tokens.csv` (`name, phone, token, link`) where
  `link = <SITE_URL>/address?g=<token>` (trailing slash trimmed, BOM for Excel).
- `SITE_URL` comes from the environment or `.env` (reuses the server's loader).
- Handles quoted CSV fields ("Alex Davila Jr." with commas/quotes), skips empty
  rows, and fails with clear messages for: missing file, missing `name`/`phone`
  headers, missing `SITE_URL`. Documented in `README.md` + `.env.example`.

## How the couple runs it

```bash
# 1. Generate personal links (guests.csv: name, phone, email?)
SITE_URL=https://your-host node scripts/import_guests.mjs guests.csv
#    → guest_tokens.csv — send each link via Twilio SMS

# 2. Track responses
curl -H "Authorization: Bearer $ADMIN_KEY" https://your-host/api/addresses      # matched vs unmatched
curl -H "Authorization: Bearer $ADMIN_KEY" https://your-host/api/addresses.csv  # spreadsheet for the invite list
```

Cross-reference `guest_tokens.csv` with the CSV's `guest_token` column to see
who hasn't responded yet.

## Tests

- **Unit** (`tests/unit/address.test.js`, 11 tests): `validateAddress` —
  required fields (incl. non-empty ZIP), every cap at boundary, whitespace
  optionals → `null`, country default, token cap + unknown tokens accepted,
  non-object rejection; API — 422 per-field, 400 non-JSON, 503 without
  `DATABASE_URL`, admin guard matrix (503 unconfigured / 401 bad token / 503
  no DB) on both new admin endpoints.
- **E2E** (`tests/e2e/address.spec.js`, 4 tests): happy-path submit → success
  message visible; empty submit → inline errors visible + first field focused;
  token round-trip — load `/address?g=abc123`, token never rendered, submit,
  POST body carries `guest_token: 'abc123'`, admin endpoint returns that row in
  `matched`; cross-links (footer → /address, RSVP ⇄ address). Mocked via
  `page.route`, consistent with the existing CI-mode e2e setup.
- Zero edits to any existing spec assertion.

## Gate output (real runs, Windows / Node v24.22.2)

```
$ npm run build
[build] 13 page(s) built in 1.21s
[build] Complete!

$ npm test
 ✓ tests/unit/address.test.js (11 tests) 16ms
 ✓ tests/unit/api.test.js (9 tests) 25ms
 ✓ tests/unit/rate-limit.test.js
 ✓ tests/unit/songs.test.js
 ✓ tests/unit/validate.test.js
 Test Files  5 passed (5)
      Tests  47 passed (47)

$ npm run test:e2e
  ok  1 [chromium] › address.spec.js › happy path: fill and submit the form, see the warm confirmation (3.6s)
  ok  2 [chromium] › address.spec.js › inline validation catches an empty submit and focuses the first field (401ms)
  ok  3 [chromium] › address.spec.js › personal token from ?g= rides along silently and shows up in the admin list (800ms)
  ok  4 [chromium] › address.spec.js › cross-links: footer links to Addresses, RSVP and address pages link to each other (379ms)
  ok  5 [chromium] › home.spec.js › home page loads with the names and wedding date visible (307ms)
  ok  6 [chromium] › rsvp.spec.js › RSVP › happy path: fill and submit the form, see the warm confirmation (1.4s)
  ok  7 [chromium] › rsvp.spec.js › RSVP › inline validation catches an empty submit (290ms)
  ok  8 [chromium] › rsvp.spec.js › RSVP › declining shows the gentle regrets message (379ms)
  ok  9 [chromium] › songs.spec.js › submitting a song shows it in the live list, deduped by title+artist (373ms)
  ok 10 [chromium] › songs.spec.js › inline validation catches an empty submit (304ms)
  10 passed (9.1s)
```

## Notes

- `not_yet_responded` was skipped per the brief (no phone numbers
  client-side); `guest_tokens.csv` + the CSV export cover the cross-reference.
- DATABASE_URL stays out of the repo (`.env` is gitignored); the live migration
  read it from the local secrets file only.
- No deploy was performed; nothing was pushed to `main`.
