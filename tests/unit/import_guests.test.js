// Import-script who-column parsing tests. scripts/import_guests.mjs is a
// top-level script (no exported functions), so it is exercised the way the
// operator runs it: spawned under bun with a temp working directory, then
// the generated guest_tokens.csv is parsed back and asserted on. No --sync,
// so no database is ever touched.
import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scriptPath = path.join(
  import.meta.dir,
  "..",
  "..",
  "scripts",
  "import_guests.mjs",
);

/** @type {string[]} */
const tempDirs = [];

/**
 * Run the import script in a fresh temp dir with the given input file
 * content and return { exitCode, csvText } — the script writes
 * guest_tokens.csv into its working directory.
 */
function runImport(inputContent, inputName = "guests.txt") {
  const dir = mkdtempSync(path.join(tmpdir(), "import-guests-"));
  tempDirs.push(dir);
  writeFileSync(path.join(dir, inputName), inputContent, "utf8");
  const proc = Bun.spawnSync([process.execPath, scriptPath, inputName], {
    cwd: dir,
    env: { ...process.env, SITE_URL: "https://wedding.test" },
    stderr: "pipe",
    stdout: "pipe",
  });
  const csvText = readFileSync(path.join(dir, "guest_tokens.csv"), "utf8");
  return {
    exitCode: proc.exitCode,
    stderr: proc.stderr.toString(),
    rows: parseCsv(csvText),
  };
}

/** Minimal CSV reader for the script's output (BOM + CRLF + quoted fields). */
function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split("\r\n")
    .filter((line) => line !== "");
  return lines.map((line) => {
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
    return fields;
  });
}

describe("import_guests who-column parsing", () => {
  it("emits name,who,token,link,message columns", () => {
    const { exitCode, rows } = runImport("Zach\n");
    expect(exitCode).toBe(0);
    expect(rows[0]).toEqual(["name", "who", "token", "link", "message"]);
    expect(rows).toHaveLength(2); // header + one guest
  });

  it('reads the who value from a "who" header column', () => {
    const { rows } = runImport(
      "name,who\nZach,Nando\nKendra,Kendra\nMom,\n",
      "guests.csv",
    );
    const data = rows.slice(1);
    expect(data.map((row) => row[0])).toEqual(["Zach", "Kendra", "Mom"]);
    expect(data.map((row) => row[1])).toEqual(["Nando", "Kendra", ""]);
  });

  it('accepts the "who_text_them" header variant', () => {
    const { rows } = runImport(
      "name,who_text_them\nZach,Nando\n",
      "guests.csv",
    );
    expect(rows[1][0]).toBe("Zach");
    expect(rows[1][1]).toBe("Nando");
  });

  it('accepts the "texted_by" header variant (with extra ignored columns)', () => {
    const { rows } = runImport(
      "phone,name,texted_by\n5551234,Zach,Kendra\n",
      "guests.csv",
    );
    expect(rows[1][0]).toBe("Zach");
    expect(rows[1][1]).toBe("Kendra");
  });

  it("normalizes known texter casing and keeps links/messages intact", () => {
    const { rows } = runImport(
      "name,who\nzach,nando\nkendRa,kendra\n",
      "guests.csv",
    );
    const zach = rows[1];
    expect(zach[0]).toBe("zach");
    expect(zach[1]).toBe("Nando");
    expect(zach[2]).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
    expect(zach[3]).toBe(`https://wedding.test/address?g=${zach[2]}`);
    expect(zach[4]).toContain(`Hey zach, We are getting addresses`);
    expect(zach[4]).toContain(zach[3]);
    expect(rows[2][1]).toBe("Kendra");
  });

  it("leaves who empty for a CSV with no who column (legacy shape)", () => {
    const { rows } = runImport("name,phone\nZach,5551234\n", "guests.csv");
    expect(rows[1][0]).toBe("Zach");
    expect(rows[1][1]).toBe("");
  });

  it("leaves who empty for a plain one-name-per-line list", () => {
    const { rows } = runImport("Zach\nKendra\n");
    const data = rows.slice(1);
    expect(data.map((row) => row[0])).toEqual(["Zach", "Kendra"]);
    expect(data.every((row) => row[1] === "")).toBe(true);
    expect(data.every((row) => row[2].length === 8)).toBe(true);
  });
});

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // temp cleanup is best-effort
    }
  }
});
