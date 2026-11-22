// Guest-tracking tests: GET /api/guests (auth, response shape, sort order,
// latest-address-wins) and the texted_by join on GET /api/addresses and
// /api/addresses.csv. server/db.js is mocked with an in-memory stand-in
// (bun:test mock.module — scoped to this file, so the real no-DB tests in
// address.test.js / api.test.js keep running against the real module).
// Same boot-the-whole-app pattern as address_tokens.test.js, including the
// dedicated TEST_IP so the shared module-level rate limiter can't interfere.
import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";

const TEST_IP = "198.51.100.11"; // TEST-NET-2 — own token bucket

// Fixture rows shaped exactly like the LEFT JOIN the /api/guests query
// issues: one row per (guest, address) pair, null address columns for
// unresponded guests. Ordered as the SQL returns them (by token, then
// oldest address first) so latest-wins can be exercised.
const guestJoinRows = [
  // Responded, texted by Nando — submitted twice; the newer address must win.
  {
    guest_name: "Bob Chen",
    token: "t-bob",
    texted_by: "Nando",
    guest_created_at: new Date("2026-11-01T10:00:00Z"),
    id: 1,
    full_name: "Bob Chen",
    street: "1 Old Way",
    unit: null,
    city: "Rockmart",
    state: "GA",
    postal_code: "30153",
    country: "USA",
    notes: null,
    guest_token: "t-bob",
    created_at: new Date("2026-11-10T10:00:00Z"),
  },
  {
    guest_name: "Bob Chen",
    token: "t-bob",
    texted_by: "Nando",
    guest_created_at: new Date("2026-11-01T10:00:00Z"),
    id: 2,
    full_name: "Bob Chen",
    street: "2 New Way",
    unit: null,
    city: "Rockmart",
    state: "GA",
    postal_code: "30153",
    country: "USA",
    notes: null,
    guest_token: "t-bob",
    created_at: new Date("2026-11-12T10:00:00Z"),
  },
  // Unresponded, texted by Kendra — sorts before every responded guest.
  {
    guest_name: "Ana Diaz",
    token: "t-ana",
    texted_by: "Kendra",
    guest_created_at: new Date("2026-11-02T10:00:00Z"),
    id: null,
    full_name: null,
    street: null,
    unit: null,
    city: null,
    state: null,
    postal_code: null,
    country: null,
    notes: null,
    guest_token: null,
    created_at: null,
  },
  // Unresponded, no texter — unclaimed rows sink below named texters.
  {
    guest_name: "Cara Lee",
    token: "t-cara",
    texted_by: null,
    guest_created_at: new Date("2026-11-03T10:00:00Z"),
    id: null,
    full_name: null,
    street: null,
    unit: null,
    city: null,
    state: null,
    postal_code: null,
    country: null,
    notes: null,
    guest_token: null,
    created_at: null,
  },
  // Responded, texted by Kendra — within responded, Kendra sorts before Nando.
  {
    guest_name: "Zach",
    token: "e8sakufe",
    texted_by: "Kendra",
    guest_created_at: new Date("2026-11-04T10:00:00Z"),
    id: 3,
    full_name: "Zach Davila",
    street: "1513 Stone Creek Lane",
    unit: null,
    city: "Rockmart",
    state: "GA",
    postal_code: "30153",
    country: "USA",
    notes: null,
    guest_token: "e8sakufe",
    created_at: new Date("2026-11-11T10:00:00Z"),
  },
];

// Fixture for the addresses LEFT JOIN guest_tokens query: a known token
// carries its texted_by, an unknown token and a manual (null-token) row
// both get NULL.
const addressJoinRows = [
  {
    id: 3,
    full_name: "Zach Davila",
    street: "1513 Stone Creek Lane",
    unit: null,
    city: "Rockmart",
    state: "GA",
    postal_code: "30153",
    country: "USA",
    notes: null,
    guest_token: "e8sakufe",
    texted_by: "Kendra",
    created_at: new Date("2026-11-11T10:00:00Z"),
  },
  {
    id: 2,
    full_name: "Bob Chen",
    street: "2 New Way",
    unit: null,
    city: "Rockmart",
    state: "GA",
    postal_code: "30153",
    country: "USA",
    notes: null,
    guest_token: "t-bob",
    texted_by: "Nando",
    created_at: new Date("2026-11-12T10:00:00Z"),
  },
  {
    id: 1,
    full_name: "Mystery Guest",
    street: "9 Nowhere Rd",
    unit: null,
    city: "Rockmart",
    state: "GA",
    postal_code: "30153",
    country: "USA",
    notes: null,
    guest_token: "zz-not-in-any-list",
    texted_by: null,
    created_at: new Date("2026-11-13T10:00:00Z"),
  },
];

// Tagged-template stand-in for the Bun SQL client — mirrors the exact query
// shapes server/app.js issues for the tracking endpoints. Whitespace is
// normalized because the tagged template captures the source's indentation.
// (Neither tracking query binds parameters, so values stays unused.)
async function fakeDb(strings) {
  const query = strings.join("$#").replace(/\s+/g, " ").trim();
  if (query.startsWith("SELECT g.guest_name, g.token, g.texted_by")) {
    return guestJoinRows;
  }
  if (query.startsWith("SELECT a.id, a.full_name, a.street, a.unit")) {
    return addressJoinRows;
  }
  throw new Error(`guests.test fakeDb: unexpected query ${query}`);
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
  delete process.env.ADMIN_KEY;
});

function get(path, headers = {}) {
  return fetch(base + path, {
    headers: { "x-forwarded-for": TEST_IP, ...headers },
  });
}

describe("GET /api/guests auth", () => {
  it("refuses without ADMIN_KEY configured (503)", async () => {
    delete process.env.ADMIN_KEY;
    const res = await get("/api/guests");
    expect(res.status).toBe(503);
  });

  it("rejects a missing or wrong bearer token (401)", async () => {
    process.env.ADMIN_KEY = "test-secret";
    const unauthed = await get("/api/guests");
    expect(unauthed.status).toBe(401);
    const wrong = await get("/api/guests", { authorization: "Bearer nope" });
    expect(wrong.status).toBe(401);
  });

  it("accepts the correct bearer token", async () => {
    const res = await get("/api/guests", {
      authorization: "Bearer test-secret",
    });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/guests shape + sort", () => {
  it("returns one row per guest with the tracking fields", async () => {
    const res = await get("/api/guests", {
      authorization: "Bearer test-secret",
    });
    const data = await res.json();
    expect(data.count).toBe(4);
    expect(data.guests).toHaveLength(4);
    for (const guest of data.guests) {
      expect(Object.keys(guest).sort()).toEqual([
        "address",
        "created_at",
        "guest_name",
        "responded",
        "texted_by",
        "token",
      ]);
      expect(typeof guest.responded).toBe("boolean");
      // ISO string, never a raw Date object (Google-Sheet paste safety).
      expect(typeof guest.created_at).toBe("string");
    }
  });

  it("sorts unresponded first, then by texted_by, then by name", async () => {
    const res = await get("/api/guests", {
      authorization: "Bearer test-secret",
    });
    const data = await res.json();
    // Unresponded: Ana (Kendra) then Cara (no texter) — unclaimed sinks last.
    // Responded: Zach (Kendra) then Bob (Nando) — alphabetical by texter.
    expect(data.guests.map((guest) => guest.guest_name)).toEqual([
      "Ana Diaz",
      "Cara Lee",
      "Zach",
      "Bob Chen",
    ]);
  });

  it("marks responded guests with their address object, unresponded with null", async () => {
    const res = await get("/api/guests", {
      authorization: "Bearer test-secret",
    });
    const data = await res.json();
    const byName = Object.fromEntries(
      data.guests.map((guest) => [guest.guest_name, guest]),
    );

    expect(byName["Ana Diaz"].responded).toBe(false);
    expect(byName["Ana Diaz"].address).toBeNull();
    expect(byName["Cara Lee"].responded).toBe(false);
    expect(byName["Cara Lee"].address).toBeNull();

    expect(byName.Zach.responded).toBe(true);
    expect(byName.Zach.address).toMatchObject({
      id: 3,
      full_name: "Zach Davila",
      street: "1513 Stone Creek Lane",
      guest_token: "e8sakufe",
      created_at: "2026-11-11T10:00:00.000Z",
    });
    expect(byName["Bob Chen"].responded).toBe(true);
  });

  it("reports only the LATEST address when a guest submitted twice", async () => {
    const res = await get("/api/guests", {
      authorization: "Bearer test-secret",
    });
    const data = await res.json();
    const bob = data.guests.find((guest) => guest.guest_name === "Bob Chen");
    expect(bob.address.id).toBe(2);
    expect(bob.address.street).toBe("2 New Way");
    expect(bob.address.created_at).toBe("2026-11-12T10:00:00.000Z");
  });
});

describe("addresses exports include texted_by from the join", () => {
  it("GET /api/addresses: known tokens carry texted_by, unknown stay null", async () => {
    const res = await get("/api/addresses", {
      authorization: "Bearer test-secret",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(3);
    // matched = rows with a guest token (known + unknown token alike)
    expect(data.matched).toHaveLength(3);
    expect(data.unmatched).toHaveLength(0);
    const byToken = Object.fromEntries(
      data.matched.map((row) => [row.guest_token, row]),
    );
    expect(byToken["e8sakufe"].texted_by).toBe("Kendra");
    expect(byToken["t-bob"].texted_by).toBe("Nando");
    expect(byToken["zz-not-in-any-list"].texted_by).toBeNull();
  });

  it("GET /api/addresses.csv: texted_by column sits between guest_token and created_at", async () => {
    const res = await get("/api/addresses.csv", {
      authorization: "Bearer test-secret",
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe(
      "id,full_name,street,unit,city,state,postal_code,country,notes,guest_token,texted_by,created_at",
    );
    const row = lines.slice(1).find((line) => line.includes("Zach Davila"));
    const fields = row.split(",");
    expect(fields[9]).toBe("e8sakufe"); // guest_token
    expect(fields[10]).toBe("Kendra"); // texted_by
    expect(fields[11]).toBe("2026-11-11T10:00:00.000Z"); // created_at
    // Unknown token → empty texted_by in the CSV.
    const unknown = lines
      .slice(1)
      .find((line) => line.includes("Mystery Guest"));
    expect(unknown.split(",")[10]).toBe("");
  });
});
