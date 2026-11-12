-- The Davilas — wedding site schema for Neon Postgres.
-- Run once against your Neon database, e.g. from the Neon SQL editor:
--   psql "$DATABASE_URL" -f schema.sql
-- (The HTTP driver used by the app connects over HTTPS; no persistent
-- connections, no migrations framework needed.)

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

-- Pre-RSVP mailing-address capture (guests arrive via /address?g=<token>).
-- Existing databases: apply migrations/001_add_addresses.sql instead.
CREATE TABLE IF NOT EXISTS addresses (
  id serial PRIMARY KEY,
  full_name text NOT NULL,
  street text NOT NULL,
  unit text,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  country text DEFAULT 'USA',
  notes text,
  guest_token text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS addresses_guest_token_idx ON addresses (guest_token);
