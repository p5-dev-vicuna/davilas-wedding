#!/usr/bin/env node
// Guest-list import for the pre-RSVP mailing-address capture.
//
// Reads a names-only list of guests — either format, auto-detected from the
// first line (treated as a CSV header when it contains a comma or equals
// "name"):
//   1. CSV with a `name` header — a `phone` column is optional and ignored
//      (Twilio legacy: guests are texted manually from the couple's own
//      phones); any other column is ignored too
//   2. plain text — one name per line, no header
//   node scripts/import_guests.mjs guests.csv
//   node scripts/import_guests.mjs guests.txt
// Generates a random 8-character personal token per name and writes
// guest_tokens.csv (name, token, link) where
//   link = <SITE_URL>/address?g=<token>
//
// With --sync, each token is also INSERTed into the guest_tokens table in
// Neon (DATABASE_URL from env/.env) so /address accepts the link:
//   node scripts/import_guests.mjs --sync guests.txt
// Without the flag the run stays CSV-only (generate first, sync later).
//
// SITE_URL comes from the environment (or .env — the same loader the server
// uses). Text each guest their link from your own phone; when they submit
// their address the token is stored invisibly, so guest_tokens.csv
// cross-references exactly who has responded (see GET /api/addresses
// "matched" group).
//
// The CSV parser below handles quoted fields containing commas/quotes (the
// typical spreadsheet export); newlines inside quoted fields are not supported
// — keep each guest on one line.
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "../server/env.js";
import { getDb } from "../server/db.js";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/O/1/l/i — read aloud safely
const TOKEN_LENGTH = 8;

/**
 * Print an error and exit(1).
 * @returns {never}
 */
function fail(message) {
  console.error(`[import_guests] ${message}`);
  process.exit(1);
}

function makeToken() {
  const bytes = crypto.randomBytes(TOKEN_LENGTH);
  let token = "";
  for (let i = 0; i < TOKEN_LENGTH; i++)
    token += ALPHABET[bytes[i] % ALPHABET.length];
  return token;
}

/** Parse one CSV line into fields, honoring "quoted,commas" and ""escapes"". */
function splitCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

/* ---------------------------------- main --------------------------------- */

loadEnvFile(); // picks up SITE_URL from .env if present (real env vars win)

const argList = process.argv.slice(2);
const sync = argList.includes("--sync");
const inputPath = argList.find((arg) => !arg.startsWith("--"));
if (!inputPath) {
  fail(
    "usage: node scripts/import_guests.mjs <names.csv|names.txt> [--sync]  " +
      "(names-only: CSV with a name header (phone column optional, ignored) or " +
      "one name per line; --sync also inserts tokens into guest_tokens)",
  );
}

let raw;
try {
  raw = readFileSync(inputPath, "utf8");
} catch {
  fail(`could not read ${inputPath} — check the path and try again.`);
}

const siteUrl = process.env.SITE_URL?.replace(/\/+$/, "");
if (!siteUrl) {
  fail(
    "SITE_URL is not set — add it to .env or the environment, e.g. SITE_URL=https://your-host",
  );
}

const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
if (lines.length === 0) fail("no guest names found — the input file is empty.");

// Auto-detect the format: a CSV's first line is a header row, so it either
// has columns (a comma) or is the bare single-column header "name". Anything
// else is a plain text list — one name per line, no header.
const firstLine = lines[0].trim();
const isCsv = firstLine.includes(",") || firstLine.toLowerCase() === "name";

/** @type {string[]} */
let names;
if (isCsv) {
  if (lines.length < 2)
    fail('the CSV needs a "name" header row and at least one guest.');
  const header = splitCsvLine(lines[0]).map((column) => column.toLowerCase());
  const nameIndex = header.indexOf("name");
  if (nameIndex === -1) {
    fail(
      `missing required column — found [${header.join(", ")}], need "name" ` +
        '(a "phone" column is optional and ignored — Twilio legacy).',
    );
  }
  names = lines.slice(1).map((line) => splitCsvLine(line)[nameIndex] ?? "");
} else {
  names = lines.map((line) => line.trim());
}

const seenTokens = new Set();
const rows = [];
let skipped = 0;

for (const name of names) {
  if (!name) {
    skipped++;
    continue;
  }
  let token = makeToken();
  while (seenTokens.has(token)) token = makeToken(); // 40 bits — collisions ~never
  seenTokens.add(token);
  rows.push({ name, token, link: `${siteUrl}/address?g=${token}` });
}

if (skipped > 0)
  console.log(`[import_guests] skipped ${skipped} empty row(s).`);

const outputPath = path.join(process.cwd(), "guest_tokens.csv");
const csv =
  "name,token,link\r\n" +
  rows
    .map((row) => [row.name, row.token, row.link].map(csvEscape).join(","))
    .join("\r\n");

writeFileSync(outputPath, "\uFEFF" + csv); // BOM so Excel opens UTF-8 happily

console.log(
  `[import_guests] wrote ${rows.length} personal link(s) to ${outputPath}`,
);

if (sync) {
  const db = getDb();
  if (!db) {
    fail(
      "--sync needs DATABASE_URL — add it to .env or the environment so tokens can be inserted into guest_tokens.",
    );
  }
  let inserted = 0;
  try {
    for (const row of rows) {
      const result = await db`
        INSERT INTO guest_tokens (token, guest_name)
        VALUES (${row.token}, ${row.name})
        ON CONFLICT (token) DO NOTHING
        RETURNING token
      `;
      if (result.length > 0) inserted++;
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    fail(`--sync failed mid-run (${reason}) — re-run to finish.`);
  } finally {
    await db.end().catch(() => {});
  }
  console.log(
    `[import_guests] synced ${rows.length} token(s) to guest_tokens ` +
      `(${inserted} new, ${rows.length - inserted} already present)`,
  );
}

console.log(
  "[import_guests] next: text each link to its guest from your own phone,",
);
console.log(
  "[import_guests]   then track responses at GET /api/addresses (matched vs",
);
console.log("[import_guests]   unmatched) or /api/addresses.csv");
