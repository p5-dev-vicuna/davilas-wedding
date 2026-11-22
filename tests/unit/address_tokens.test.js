// Invite-only /address gate tests: the public token-validate endpoint and
// the guest_token requirement on POST /api/address. server/db.js is mocked
// with an in-memory guest_tokens map (bun:test mock.module — mocks are
// scoped to this test file, so the real no-DB 503 tests in address.test.js
// keep running against the real module). Same boot-the-whole-app-on-an-
// ephemeral-port pattern as address.test.js, including the dedicated
// TEST_IP so the shared module-level rate limiter can't interfere.
import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";

const TEST_IP = "198.51.100.9"; // TEST-NET-2 — own token bucket
const tokens = new Map([
  ["e8sakufe", "Zach"],
  ["h4zxhqe7", "Kendra"],
]);
const insertCalls = [];

// Tagged-template stand-in for the Bun SQL client — mirrors the exact query
// shapes server/app.js issues for the gate (SELECT … FROM guest_tokens and
// the INSERT … SELECT … WHERE token JOIN check). Whitespace is normalized
// because the tagged template captures the source's indentation verbatim.
async function fakeDb(strings, ...values) {
  const query = strings.join("$#").replace(/\s+/g, " ").trim();
  if (query.startsWith("SELECT guest_name FROM guest_tokens")) {
    const token = values[0];
    return tokens.has(token) ? [{ guest_name: tokens.get(token) }] : [];
  }
  if (query.startsWith("INSERT INTO addresses")) {
    // The JOIN check: a row only lands when the token exists.
    const token = values[values.length - 1];
    if (!tokens.has(token)) return [];
    insertCalls.push(values);
    return [{ id: insertCalls.length }];
  }
  throw new Error(`address_tokens.test fakeDb: unexpected query ${query}`);
}

mock.module("../../server/db.js", () => ({
  getDb: () => fakeDb,
  dbConfigured: () => true,
}));

const { createApp } = await import("../../server/app.js");

let server;
let base;

beforeAll(() => {
  server = createApp({ port: 0 });
  base = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

function get(path) {
  return fetch(base + path, {
    headers: { "x-forwarded-for": TEST_IP },
  });
}

function postJson(path, body) {
  return fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": TEST_IP },
    body: JSON.stringify(body),
  });
}

const validAddress = {
  full_name: "Zach Davila",
  street: "1513 Stone Creek Lane",
  city: "Rockmart",
  state: "GA",
  postal_code: "30153",
};

describe("GET /api/address/validate", () => {
  it("returns valid:true with the guest name for a known token", async () => {
    const res = await get("/api/address/validate?g=e8sakufe");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: true, guest_name: "Zach" });
  });

  it("returns valid:false for an unknown token", async () => {
    const res = await get("/api/address/validate?g=zz-not-sent");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: false });
  });

  it("returns valid:false when the token is missing entirely", async () => {
    const res = await get("/api/address/validate");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: false });
  });
});

describe("POST /api/address invite-only gate", () => {
  it("rejects a tokenless submission with 403 and the invite-only message", async () => {
    const res = await postJson("/api/address", validAddress);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/personal link/i);
  });

  it("rejects an unknown token with 403 (JOIN check: nothing inserts)", async () => {
    const before = insertCalls.length;
    const res = await postJson("/api/address", {
      ...validAddress,
      guest_token: "zz-not-sent",
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/personal link/i);
    expect(insertCalls.length).toBe(before);
  });

  it("accepts a known token, inserts once, and stores the token", async () => {
    const before = insertCalls.length;
    const res = await postJson("/api/address", {
      ...validAddress,
      guest_token: "h4zxhqe7",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toMatch(/sealed and delivered/i);
    expect(insertCalls.length).toBe(before + 1);
    // INSERT ... SELECT parameter order ends with the token (WHERE t.token).
    const params = insertCalls[insertCalls.length - 1];
    expect(params[params.length - 1]).toBe("h4zxhqe7");
    expect(params[0]).toBe("Zach Davila");
  });
});
