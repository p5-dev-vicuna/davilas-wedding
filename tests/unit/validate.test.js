import { describe, expect, it } from "bun:test";
import {
  RSVP_LIMITS,
  SONG_LIMITS,
  validateRsvp,
  validateSong,
} from "../../server/validate.js";

const validRsvp = {
  full_name: "  Kendra Davila ",
  attending: true,
  party_size: 2,
  allergies: " vegetarian ",
  song_request: "At Last",
  notes: "",
};

describe("validateRsvp", () => {
  it("accepts a complete payload and normalizes it", () => {
    const result = validateRsvp(validRsvp);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      full_name: "Kendra Davila",
      attending: true,
      party_size: 2,
      allergies: "vegetarian",
      song_request: "At Last",
      notes: null,
    });
  });

  it("rejects non-object bodies", () => {
    for (const bad of [null, undefined, "nope", 42, [], [{}]]) {
      const result = validateRsvp(bad);
      expect(result.ok).toBe(false);
      expect(result.errors._form).toBeTruthy();
    }
  });

  it("requires a full name within the length cap", () => {
    expect(
      validateRsvp({ ...validRsvp, full_name: "   " }).errors.full_name,
    ).toBeTruthy();
    expect(
      validateRsvp({ ...validRsvp, full_name: 42 }).errors.full_name,
    ).toBeTruthy();
    expect(
      validateRsvp({
        ...validRsvp,
        full_name: "x".repeat(RSVP_LIMITS.name + 1),
      }).errors.full_name,
    ).toBeTruthy();
    expect(
      validateRsvp({ ...validRsvp, full_name: "x".repeat(RSVP_LIMITS.name) })
        .ok,
    ).toBe(true);
  });

  it("requires attending to resolve to a boolean", () => {
    expect(
      validateRsvp({ ...validRsvp, attending: undefined }).errors.attending,
    ).toBeTruthy();
    expect(
      validateRsvp({ ...validRsvp, attending: "yes" }).errors.attending,
    ).toBeTruthy();
    expect(
      validateRsvp({ ...validRsvp, attending: 1 }).errors.attending,
    ).toBeTruthy();
    expect(
      validateRsvp({ ...validRsvp, attending: "true" }).value.attending,
    ).toBe(true);
    expect(
      validateRsvp({ ...validRsvp, attending: "false" }).value.attending,
    ).toBe(false);
    expect(
      validateRsvp({ ...validRsvp, attending: false }).value.attending,
    ).toBe(false);
  });

  it("enforces an integer party size between 1 and 10", () => {
    for (const bad of [0, -1, 11, 2.5, "abc", true, null, undefined, ""]) {
      expect(
        validateRsvp({ ...validRsvp, party_size: bad }).errors.party_size,
      ).toBeTruthy();
    }
    expect(validateRsvp({ ...validRsvp, party_size: 1 }).ok).toBe(true);
    expect(validateRsvp({ ...validRsvp, party_size: 10 }).ok).toBe(true);
    expect(
      validateRsvp({ ...validRsvp, party_size: "3" }).value.party_size,
    ).toBe(3);
    expect(
      validateRsvp({ ...validRsvp, party_size: "3 " }).value.party_size,
    ).toBe(3);
  });

  it("caps optional field lengths", () => {
    expect(
      validateRsvp({
        ...validRsvp,
        allergies: "a".repeat(RSVP_LIMITS.allergies + 1),
      }).errors.allergies,
    ).toBeTruthy();
    expect(
      validateRsvp({
        ...validRsvp,
        allergies: "a".repeat(RSVP_LIMITS.allergies),
      }).ok,
    ).toBe(true);
    expect(
      validateRsvp({
        ...validRsvp,
        song_request: "s".repeat(RSVP_LIMITS.song + 1),
      }).errors.song_request,
    ).toBeTruthy();
    expect(
      validateRsvp({ ...validRsvp, song_request: "s".repeat(RSVP_LIMITS.song) })
        .ok,
    ).toBe(true);
    expect(
      validateRsvp({ ...validRsvp, notes: "n".repeat(RSVP_LIMITS.notes + 1) })
        .errors.notes,
    ).toBeTruthy();
    expect(
      validateRsvp({ ...validRsvp, notes: "n".repeat(RSVP_LIMITS.notes) }).ok,
    ).toBe(true);
  });

  it("treats whitespace-only optional fields as null", () => {
    const result = validateRsvp({
      ...validRsvp,
      allergies: "   ",
      song_request: "",
      notes: "  ",
    });
    expect(result.value.allergies).toBeNull();
    expect(result.value.song_request).toBeNull();
    expect(result.value.notes).toBeNull();
  });

  it("collects every error at once", () => {
    const result = validateRsvp({});
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual([
      "attending",
      "full_name",
      "party_size",
    ]);
  });
});

describe("validateSong", () => {
  it("accepts and trims a valid request", () => {
    const result = validateSong({
      title: " At Last ",
      artist: "Etta James ",
      requested_by: " Nando ",
    });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      title: "At Last",
      artist: "Etta James",
      requested_by: "Nando",
    });
  });

  it("requires title, artist, and name", () => {
    const result = validateSong({ title: "", artist: "", requested_by: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.title).toBeTruthy();
    expect(result.errors.artist).toBeTruthy();
    expect(result.errors.requested_by).toBeTruthy();
  });

  it("caps lengths at 200/200/120", () => {
    expect(
      validateSong({
        title: "t".repeat(SONG_LIMITS.title + 1),
        artist: "a",
        requested_by: "n",
      }).errors.title,
    ).toBeTruthy();
    expect(
      validateSong({
        title: "t",
        artist: "a".repeat(SONG_LIMITS.artist + 1),
        requested_by: "n",
      }).errors.artist,
    ).toBeTruthy();
    expect(
      validateSong({
        title: "t",
        artist: "a",
        requested_by: "n".repeat(SONG_LIMITS.name + 1),
      }).errors.requested_by,
    ).toBeTruthy();
  });

  it("rejects non-object bodies", () => {
    expect(validateSong(null).ok).toBe(false);
    expect(validateSong("At Last").ok).toBe(false);
    expect(validateSong([]).ok).toBe(false);
  });
});
