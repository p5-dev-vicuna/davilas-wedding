-- Migration: add `texted_by` to guest_tokens ("who texted them").
-- Nando and Kendra split the guest list and each text their half manually;
-- scripts/import_guests.mjs (--sync) records who texted which guest so the
-- tracking output (GET /api/guests, /api/addresses.csv) can be filtered by
-- texter. Values: 'Nando' / 'Kendra' (or empty — plain name lists carry no
-- texter). Existing databases: apply this file alone, e.g.
--   psql "$DATABASE_URL" -f migrations/003_add_texted_by.sql
-- (Fresh databases can simply run schema.sql, which includes the column.)

ALTER TABLE guest_tokens ADD COLUMN IF NOT EXISTS texted_by text;
