import { describe, expect, it } from "bun:test";
import { aggregateSongs, firstName, songKey } from "../../shared/songs.js";

const rows = [
  {
    title: "At Last",
    artist: "Etta James",
    requestedBy: "Kendra",
    createdAt: "2027-01-01T10:00:00.000Z",
  },
  {
    title: "at last ",
    artist: " etta james",
    requestedBy: "Nando",
    createdAt: "2027-01-02T10:00:00.000Z",
  },
  {
    title: "Brown Eyed Girl",
    artist: "Van Morrison",
    requestedBy: "Aunt Bee",
    createdAt: "2027-01-03T10:00:00.000Z",
  },
  {
    title: "At Last",
    artist: "Beyoncé",
    requestedBy: "Cousin Ray",
    createdAt: "2027-01-04T10:00:00.000Z",
  },
];

describe("aggregateSongs", () => {
  it("dedupes by lowercase title+artist", () => {
    const aggregated = aggregateSongs(rows);
    expect(aggregated).toHaveLength(3);
    const etta = aggregated.find((s) => s.artist === "Etta James");
    expect(etta.count).toBe(2);
  });

  it("treats the same title with a different artist as a distinct song", () => {
    const aggregated = aggregateSongs(rows);
    expect(
      aggregated.some((s) => s.artist === "Beyoncé" && s.count === 1),
    ).toBe(true);
  });

  it("sorts by count desc, then title A→Z, then artist A→Z", () => {
    const aggregated = aggregateSongs(rows);
    expect(aggregated.map((s) => `${s.title}|${s.artist}`)).toEqual([
      "At Last|Etta James",
      "At Last|Beyoncé",
      "Brown Eyed Girl|Van Morrison",
    ]);
  });

  it("keeps the most recent requester on duplicates", () => {
    const aggregated = aggregateSongs(rows);
    const etta = aggregated.find((s) => s.artist === "Etta James");
    expect(etta.requestedBy).toBe("Nando");
    expect(etta.latestAt).toBe("2027-01-02T10:00:00.000Z");
  });

  it("returns [] for empty or invalid input", () => {
    expect(aggregateSongs([])).toEqual([]);
    expect(aggregateSongs(null)).toEqual([]);
    expect(aggregateSongs("nope")).toEqual([]);
    expect(aggregateSongs([null, 7, {}, { title: "  ", artist: " " }])).toEqual(
      [],
    );
  });

  it("trims titles and artists for display", () => {
    const [song] = aggregateSongs([
      {
        title: "  Sweet Caroline  ",
        artist: " Neil Diamond ",
        requestedBy: "Al",
      },
    ]);
    expect(song.title).toBe("Sweet Caroline");
    expect(song.artist).toBe("Neil Diamond");
  });
});

describe("songKey", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(songKey(" At Last ", "ETTA james")).toBe(
      songKey("at last", "Etta James"),
    );
  });

  it("separates title from artist with a delimiter", () => {
    expect(songKey("a|b", "c")).not.toBe(songKey("a", "b|c"));
  });
});

describe("firstName", () => {
  it("returns only the first word of a name", () => {
    expect(firstName("  Mary Jane Watson ")).toBe("Mary");
    expect(firstName("Nando")).toBe("Nando");
  });

  it("handles empty or missing names", () => {
    expect(firstName("")).toBe("");
    expect(firstName(null)).toBe("");
    expect(firstName(undefined)).toBe("");
  });
});
