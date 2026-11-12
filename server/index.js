#!/usr/bin/env bun
// The Davilas — Bun-native server entrypoint.
//
//   dev:  bun run dev   (BUN_DEV=1 bun server/index.js)
//         HTML routes are bundled on demand with HMR + browser-console relaying.
//   prod: bun run build  →  bun run start  (cd dist && bun index.js)
//         HTML imports resolve to the pre-built asset manifest — no runtime
//         bundling.
//
// Serves every page, the API, public/ assets, and the styled 404 on port 3000
// (or $PORT).
import { loadEnvFile } from "./env.js";
import { createApp } from "./app.js";
import { dbConfigured } from "./db.js";

loadEnvFile();

const port = Number(process.env.PORT) || 3000;
const development = process.env.BUN_DEV === "1";

if (!dbConfigured()) {
  console.warn(
    "\n[server] DATABASE_URL is not set — RSVP, song, and address submissions will return 503\n" +
      "          until Neon credentials are configured. Copy .env.example to .env to start.\n",
  );
}
if (!process.env.ADMIN_KEY) {
  console.warn(
    "[server] ADMIN_KEY is not set — admin endpoints (GET /api/rsvps, /api/rsvps.csv,\n" +
      "         /api/addresses, /api/addresses.csv) are disabled.\n",
  );
}

const server = createApp({ port, development });

console.log(
  `[server] The Davilas are ready — http://localhost:${server.port} (pages + /api)` +
    (development ? " [dev · HMR on]" : ""),
);

function shutdown(signal) {
  console.log(`\n[server] ${signal} received — closing gracefully.`);
  server.stop(true);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
