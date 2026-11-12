// Live-database verification helper for the bun-native rewrite.
// Usage:
//   bun scripts/db-check.mjs counts   — print rsvps / song_requests row counts
//   bun scripts/db-check.mjs cleanup  — delete the verification test rows, then print counts
// Reads DATABASE_URL from the environment (or .env via server/env.js).
import { SQL } from "bun";
import { loadEnvFile } from "../server/env.js";

loadEnvFile();

const TEST_RSVP_NAME = "Bun Rewrite Verification";
const TEST_SONG_TITLE = "Bun Rewrite Verification Song";

if (!process.env.DATABASE_URL) {
  console.error("[db-check] DATABASE_URL is not set — nothing to do.");
  process.exit(1);
}

const sql = new SQL(process.env.DATABASE_URL);
const command = process.argv[2] ?? "counts";

async function counts() {
  const [{ rsvpCount }, { songCount }] = await Promise.all([
    sql`SELECT count(*)::int AS rsvpCount FROM rsvps`,
    sql`SELECT count(*)::int AS songCount FROM song_requests`,
  ]);
  return { rsvpCount, songCount };
}

try {
  if (command === "cleanup") {
    const deletedRsvps =
      await sql`DELETE FROM rsvps WHERE full_name = ${TEST_RSVP_NAME} RETURNING id`;
    const deletedSongs =
      await sql`DELETE FROM song_requests WHERE title = ${TEST_SONG_TITLE} RETURNING id`;
    console.log(
      `[db-check] deleted ${deletedRsvps.length} test RSVP(s), ${deletedSongs.length} test song(s)`,
    );
  } else if (command !== "counts") {
    console.error(
      `[db-check] unknown command: ${command} (use 'counts' or 'cleanup')`,
    );
    process.exit(1);
  }
  const { rsvpCount, songCount } = await counts();
  console.log(`[db-check] rsvps=${rsvpCount} song_requests=${songCount}`);
} finally {
  await sql.end();
}
