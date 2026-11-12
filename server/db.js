// Postgres access via Bun's built-in SQL client (`import { SQL } from "bun"`)
// — no driver dependency. The client is constructed lazily against
// DATABASE_URL (the pooled Neon endpoint, plain TCP) and connects lazily too,
// so an unconfigured machine never touches the network. Returns null when
// DATABASE_URL isn't set so the API can respond with a clear 503 (the site
// deploys before database credentials exist).
import { SQL } from "bun";

/** @type {import('bun').SQL | null} */
let client = null;
let warned = false;

/** Returns the Bun SQL client (tagged-template callable), or null when DATABASE_URL is not set. */
export function getDb() {
  if (!process.env.DATABASE_URL) {
    if (!warned) {
      warned = true;
      console.warn(
        "[db] DATABASE_URL is not set — submission endpoints will return 503 " +
          "until Neon credentials are configured (see .env.example).",
      );
    }
    return null;
  }
  if (!client) {
    // This Bun canary (1.4.4-canary.1) rejects postgres URL strings with
    // "Unsupported protocol" even for postgres:// — construct from an
    // options object parsed out of DATABASE_URL instead (details in
    // BUN_CANARY_NOTES.md).
    const raw = process.env.DATABASE_URL.trim().replace(/^["']+|["']+$/g, "");
    const u = new URL(raw); // accepts both postgres:// and postgresql://
    client = new SQL({
      adapter: "postgres",
      hostname: u.hostname,
      port: Number(u.port || 5432),
      database: u.pathname.replace(/^\//, ""),
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      tls: true,
    });
    console.log("[db] Bun SQL configured (Neon pooled endpoint, TCP).");
  }
  return client;
}

export function dbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
