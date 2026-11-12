// End-to-end tests of the Bun.serve app itself — booted on an ephemeral port
// and driven with real HTTP, so the exact route table, rate limiting, static
// fallback, and 404 handling are exercised.
//
// These run WITHOUT DATABASE_URL/ADMIN_KEY configured, exercising exactly the
// "deployed before credentials exist" path. NB: bun auto-loads .env (unlike
// vitest, which never did) — we scrub DATABASE_URL for the duration so the
// no-database path is what gets tested even on a machine with real creds.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createApp } from "../../server/app.js";

let server;
let base;

const hadDatabaseUrl = process.env.DATABASE_URL;

beforeAll(() => {
  delete process.env.DATABASE_URL;
  server = createApp({ port: 0 });
  base = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
  if (hadDatabaseUrl !== undefined) process.env.DATABASE_URL = hadDatabaseUrl;
  delete process.env.ADMIN_KEY;
});

function postJson(path, body) {
  return fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API without a database configured", () => {
  it("rejects a malformed RSVP body with 422 and field errors", async () => {
    const res = await postJson("/api/rsvp", {
      full_name: "",
      attending: "maybe",
      party_size: 99,
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.errors.full_name).toBeTruthy();
    expect(data.errors.attending).toBeTruthy();
    expect(data.errors.party_size).toBeTruthy();
  });

  it("returns 503 for a VALID RSVP when DATABASE_URL is unset", async () => {
    const res = await postJson("/api/rsvp", {
      full_name: "Test Guest",
      attending: true,
      party_size: 2,
      allergies: "gluten-free",
      song_request: "At Last",
      notes: "so excited",
    });
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toMatch(/available/i);
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await fetch(base + "/api/rsvp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json at all",
    });
    expect(res.status).toBe(400);
  });

  it("returns an empty public song list with 200", async () => {
    const res = await fetch(base + "/api/songs");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.songs).toEqual([]);
  });

  it("rejects a malformed song request with 422", async () => {
    const res = await postJson("/api/song", {
      title: "",
      artist: "x".repeat(201),
      requested_by: "",
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.errors.title).toBeTruthy();
    expect(data.errors.artist).toBeTruthy();
    expect(data.errors.requested_by).toBeTruthy();
  });

  it("returns 503 for a VALID song request when DATABASE_URL is unset", async () => {
    const res = await postJson("/api/song", {
      title: "At Last",
      artist: "Etta James",
      requested_by: "Kendra",
    });
    expect(res.status).toBe(503);
  });

  it("guards admin endpoints (503 unconfigured, 401 bad token, 503 no DB)", async () => {
    // No ADMIN_KEY configured → refuse.
    const unconfigured = await fetch(base + "/api/rsvps");
    expect(unconfigured.status).toBe(503);

    // Key configured, wrong/missing bearer token → 401.
    process.env.ADMIN_KEY = "test-secret";
    const unauthed = await fetch(base + "/api/rsvps");
    expect(unauthed.status).toBe(401);
    const wrongToken = await fetch(base + "/api/rsvps", {
      headers: { authorization: "Bearer nope" },
    });
    expect(wrongToken.status).toBe(401);

    // Correct token but no database → 503 from the DB layer.
    const authed = await fetch(base + "/api/rsvps", {
      headers: { authorization: "Bearer test-secret" },
    });
    expect(authed.status).toBe(503);
    const csv = await fetch(base + "/api/rsvps.csv", {
      headers: { authorization: "Bearer test-secret" },
    });
    expect(csv.status).toBe(503);

    delete process.env.ADMIN_KEY;
  });

  it("rate limits abusive clients with 429", async () => {
    let saw429 = false;
    // Previous tests consumed ~11 tokens for this IP; capacity 60.
    for (let i = 0; i < 70; i++) {
      const res = await postJson("/api/rsvp", {});
      if (res.status === 429) {
        saw429 = true;
        const retryAfter = res.headers.get("retry-after");
        expect(retryAfter).toBeTruthy();
        const data = await res.json();
        expect(data.error).toMatch(/too many/i);
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});

describe("static serving", () => {
  it("serves pages for real routes (no SPA fallback for junk)", async () => {
    const home = await fetch(base + "/");
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toMatch(/text\/html/);

    const about = await fetch(base + "/about");
    expect(about.status).toBe(200);

    const missing = await fetch(base + "/this-page-does-not-exist");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toMatch(/wandered off/);
  });

  it("serves public/ assets (favicon, stylesheet)", async () => {
    const favicon = await fetch(base + "/favicon.svg");
    expect(favicon.status).toBe(200);
    expect(favicon.headers.get("content-type")).toMatch(/image\/svg/);

    const css = await fetch(base + "/styles/global.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toMatch(/text\/css/);
  });
});
