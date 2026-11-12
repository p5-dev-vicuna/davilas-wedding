#!/usr/bin/env node
// Guest-list import for the pre-RSVP mailing-address capture.
//
// Reads a CSV of guests (headers: name, phone; email column optional):
//   node scripts/import_guests.mjs guests.csv
// Generates a random 8-character personal token per row and writes
// guest_tokens.csv (name, phone, token, link) where
//   link = <SITE_URL>/address?g=<token>
//
// SITE_URL comes from the environment (or .env — the same loader the server
// uses). Send each guest their link via Twilio SMS; when they submit their
// address the token is stored invisibly, so guest_tokens.csv cross-references
// exactly who has responded (see GET /api/addresses "matched" group).
//
// The CSV parser below handles quoted fields containing commas/quotes (the
// typical spreadsheet export); newlines inside quoted fields are not supported
// — keep each guest on one line.
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "../server/env.js";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/O/1/l/i — read aloud safely
const TOKEN_LENGTH = 8;

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

const inputPath = process.argv[2];
if (!inputPath) {
  fail(
    "usage: node scripts/import_guests.mjs <guests.csv>  (headers: name, phone; email optional)",
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
if (lines.length < 2)
  fail("the CSV needs a header row (name, phone) and at least one guest.");

const header = splitCsvLine(lines[0]).map((column) => column.toLowerCase());
const nameIndex = header.indexOf("name");
const phoneIndex = header.indexOf("phone");
if (nameIndex === -1 || phoneIndex === -1) {
  fail(
    `missing required column(s) — found [${header.join(", ")}], need "name" and "phone".`,
  );
}

const seenTokens = new Set();
const rows = [];
let skipped = 0;

for (const line of lines.slice(1)) {
  const columns = splitCsvLine(line);
  const name = columns[nameIndex] ?? "";
  const phone = columns[phoneIndex] ?? "";
  if (!name && !phone) {
    skipped++;
    continue;
  }
  if (!name) {
    fail(`row has a phone but no name: "${phone}" — every guest needs a name.`);
  }
  let token = makeToken();
  while (seenTokens.has(token)) token = makeToken(); // 40 bits — collisions ~never
  seenTokens.add(token);
  rows.push({ name, phone, token, link: `${siteUrl}/address?g=${token}` });
}

if (skipped > 0)
  console.log(`[import_guests] skipped ${skipped} empty row(s).`);

const outputPath = path.join(process.cwd(), "guest_tokens.csv");
const csv =
  "name,phone,token,link\r\n" +
  rows
    .map((row) =>
      [row.name, row.phone, row.token, row.link].map(csvEscape).join(","),
    )
    .join("\r\n");

writeFileSync(outputPath, "\uFEFF" + csv); // BOM so Excel opens UTF-8 happily

console.log(
  `[import_guests] wrote ${rows.length} personal link(s) to ${outputPath}`,
);
console.log(
  "[import_guests] next: send each link via Twilio SMS, then track responses at",
);
console.log(
  "[import_guests]   GET /api/addresses (matched vs unmatched) or /api/addresses.csv",
);
