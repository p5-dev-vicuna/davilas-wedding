-- Migration: add the `addresses` table (pre-RSVP mailing-address capture).
-- Neon already has the rsvps / song_requests tables from schema.sql — apply
-- this file alone to add addresses incrementally:
--   psql "$DATABASE_URL" -f migrations/001_add_addresses.sql
-- (Fresh databases can simply run schema.sql, which includes this table.)

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
