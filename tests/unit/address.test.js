// Address-capture tests: validation, admin auth on the address endpoints, and
// the no-database 503 path. Like api.test.js, these boot the whole Bun.serve
// app on an ephemeral port and drive it with real HTTP, WITHOUT DATABASE_URL
// configured (bun auto-loads .env, so we scrub DATABASE_URL for the duration
// to test exactly the "deployed before credentials exist" path).
//
// NB: the rate limiter inside server/app.js is module-level, i.e. shared by
// every createApp() instance in this bun test process (api.test.js boots its
// own). These requests pin a distinct client IP via X-Forwarded-For so this
// file gets its own token bucket and file execution order can never matter.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createApp } from "../../server/app.js";
import { ADDRESS_LIMITS, validateAddress } from "../../server/validate.js";

let server;
let base;

const hadDatabaseUrl = process.env.DATABASE_URL;
const TEST_IP = "198.51.100.7"; // TEST-NET-2 — see the note above

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
    headers: { "content-type": "application/json", "x-forwarded-for": TEST_IP },
    body: JSON.stringify(body),
  });
}

function get(path, headers = {}) {
  return fetch(base + path, {
    headers: { "x-forwarded-for": TEST_IP, ...headers },
  });
}

const validAddress = {
  full_name: "  Fernanda & Alex Davila ",
  street: " 1513 Stone Creek Lane ",
  unit: "Unit B",
  city: " Rockmart ",
  state: "GA",
  postal_code: "30153",
  country: "USA",
  notes: "we're moving in June",
  guest_token: "abc123",
};

describe("validateAddress", () => {
  it("accepts a complete payload, trims it, and defaults country", () => {
    const result = validateAddress(validAddress);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      full_name: "Fernanda & Alex Davila",
      street: "1513 Stone Creek Lane",
      unit: "Unit B",
      city: "Rockmart",
      state: "GA",
      postal_code: "30153",
      country: "USA",
      notes: "we're moving in June",
      guest_token: "abc123",
    });
  });

  it("rejects non-object bodies", () => {
    for (const bad of [null, undefined, "nope", 42, [], [{}]]) {
      const result = validateAddress(bad);
      expect(result.ok).toBe(false);
      expect(result.errors._form).toBeTruthy();
    }
  });

  it("requires name, street, city, state, and a non-empty ZIP", () => {
    const result = validateAddress({
      ...validAddress,
      full_name: " ",
      street: "",
      city: "  ",
      state: "",
      postal_code: "  ",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.full_name).toBeTruthy();
    expect(result.errors.street).toBeTruthy();
    expect(result.errors.city).toBeTruthy();
    expect(result.errors.state).toBeTruthy();
    expect(result.errors.postal_code).toBeTruthy();
  });

  it("collects every missing required field at once", () => {
    const result = validateAddress({});
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual([
      "city",
      "full_name",
      "postal_code",
      "state",
      "street",
    ]);
  });

  it("enforces the per-field caps", () => {
    expect(
      validateAddress({
        ...validAddress,
        full_name: "n".repeat(ADDRESS_LIMITS.name + 1),
      }).errors.full_name,
    ).toBeTruthy();
    expect(
      validateAddress({
        ...validAddress,
        street: "s".repeat(ADDRESS_LIMITS.street + 1),
      }).errors.street,
    ).toBeTruthy();
    expect(
      validateAddress({
        ...validAddress,
        unit: "u".repeat(ADDRESS_LIMITS.unit + 1),
      }).errors.unit,
    ).toBeTruthy();
    expect(
      validateAddress({
        ...validAddress,
        city: "c".repeat(ADDRESS_LIMITS.city + 1),
      }).errors.city,
    ).toBeTruthy();
    expect(
      validateAddress({
        ...validAddress,
        state: "s".repeat(ADDRESS_LIMITS.state + 1),
      }).errors.state,
    ).toBeTruthy();
    expect(
      validateAddress({
        ...validAddress,
        postal_code: "z".repeat(ADDRESS_LIMITS.postal + 1),
      }).errors.postal_code,
    ).toBeTruthy();
    expect(
      validateAddress({
        ...validAddress,
        country: "c".repeat(ADDRESS_LIMITS.country + 1),
      }).errors.country,
    ).toBeTruthy();
    expect(
      validateAddress({
        ...validAddress,
        notes: "n".repeat(ADDRESS_LIMITS.notes + 1),
      }).errors.notes,
    ).toBeTruthy();
    // Exactly at the caps passes.
    expect(
      validateAddress({
        ...validAddress,
        full_name: "n".repeat(ADDRESS_LIMITS.name),
      }).ok,
    ).toBe(true);
  });

  it("treats whitespace-only optional fields as null and defaults country to USA", () => {
    const result = validateAddress({
      ...validAddress,
      unit: "   ",
      country: "  ",
      notes: "",
      guest_token: "",
    });
    expect(result.ok).toBe(true);
    expect(result.value.unit).toBeNull();
    expect(result.value.country).toBe("USA");
    expect(result.value.notes).toBeNull();
    expect(result.value.guest_token).toBeNull();
  });

  it("caps the silent guest token but accepts unknown tokens as-is", () => {
    expect(
      validateAddress({
        ...validAddress,
        guest_token: "x".repeat(ADDRESS_LIMITS.token + 1),
      }).errors.guest_token,
    ).toBeTruthy();
    const unknown = validateAddress({
      ...validAddress,
      guest_token: "zzz-not-in-any-list",
    });
    expect(unknown.ok).toBe(true);
    expect(unknown.value.guest_token).toBe("zzz-not-in-any-list");
  });
});

describe("address API without a database configured", () => {
  it("rejects a malformed address with 422 and per-field errors", async () => {
    const res = await postJson("/api/address", {
      full_name: "",
      street: "",
      city: "",
      state: "",
      postal_code: "",
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.errors.full_name).toBeTruthy();
    expect(data.errors.street).toBeTruthy();
    expect(data.errors.city).toBeTruthy();
    expect(data.errors.state).toBeTruthy();
    expect(data.errors.postal_code).toBeTruthy();
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await fetch(base + "/api/address", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": TEST_IP,
      },
      body: "not json at all",
    });
    expect(res.status).toBe(400);
  });

  it("returns 503 for a VALID address when DATABASE_URL is unset", async () => {
    const res = await postJson("/api/address", validAddress);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toMatch(/available/i);
  });

  it("guards the admin address endpoints (503 unconfigured, 401 bad token, 503 no DB)", async () => {
    // No ADMIN_KEY configured → refuse.
    delete process.env.ADMIN_KEY;
    const unconfigured = await get("/api/addresses");
    expect(unconfigured.status).toBe(503);
    const unconfiguredCsv = await get("/api/addresses.csv");
    expect(unconfiguredCsv.status).toBe(503);

    // Key configured, wrong/missing bearer token → 401.
    process.env.ADMIN_KEY = "test-secret";
    const unauthed = await get("/api/addresses");
    expect(unauthed.status).toBe(401);
    const wrongToken = await get("/api/addresses.csv", {
      authorization: "Bearer nope",
    });
    expect(wrongToken.status).toBe(401);

    // Correct token but no database → 503 from the DB layer.
    const authed = await get("/api/addresses", {
      authorization: "Bearer test-secret",
    });
    expect(authed.status).toBe(503);
    const authedCsv = await get("/api/addresses.csv", {
      authorization: "Bearer test-secret",
    });
    expect(authedCsv.status).toBe(503);

    delete process.env.ADMIN_KEY;
  });
});
