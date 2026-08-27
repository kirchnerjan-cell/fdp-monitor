import { describe, it, expect } from "vitest";
import { fmt, dfmt, esc, extractFdp } from "../monitor-utils.js";

describe("fmt", () => {
  it("formats with one decimal, German locale (comma)", () => {
    expect(fmt(4.5)).toBe("4,5");
  });

  it("rounds to one decimal", () => {
    expect(fmt(4.449)).toBe("4,4");
    expect(fmt(4.451)).toBe("4,5");
  });

  it("pads whole numbers to one decimal", () => {
    expect(fmt(5)).toBe("5,0");
  });

  it("handles negative numbers", () => {
    expect(fmt(-0.3)).toBe("-0,3");
  });
});

describe("dfmt", () => {
  it("formats an ISO date as DD.MM.YYYY", () => {
    expect(dfmt("2026-08-27")).toBe("27.08.2026");
  });

  it("returns empty string for falsy input", () => {
    expect(dfmt(null)).toBe("");
    expect(dfmt(undefined)).toBe("");
    expect(dfmt("")).toBe("");
  });

  it("returns the original string unchanged if it cannot be parsed as a date", () => {
    expect(dfmt("not-a-date")).toBe("not-a-date");
  });

  it("formats a full ISO timestamp", () => {
    expect(dfmt("2026-08-27T10:15:00+02:00")).toBe("27.08.2026");
  });
});

describe("esc", () => {
  it("escapes ampersand, angle brackets and double quotes", () => {
    expect(esc(`<script>alert("x")&y</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&amp;y&lt;/script&gt;"
    );
  });

  it("leaves plain text untouched", () => {
    expect(esc("Hallo Welt")).toBe("Hallo Welt");
  });

  it("coerces null/undefined to empty string", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  it("coerces numbers to strings", () => {
    expect(esc(4.5)).toBe("4.5");
  });

  it("does not double-escape already-escaped entities (escapes the ampersand again, as designed)", () => {
    expect(esc("&amp;")).toBe("&amp;amp;");
  });
});

describe("extractFdp", () => {
  const baseDb = {
    Parties: { "1": { Shortcut: "FDP" }, "2": { Shortcut: "CDU" } },
    Parliaments: { "10": { Shortcut: "BT", Name: "Deutscher Bundestag" } },
    Institutes: { "5": { Name: "Forsa" } },
    Surveys: {
      "100": { Parliament_ID: 10, Institute_ID: 5, Date: "2026-08-01", Results: { "1": 4.5, "2": 30 } },
    },
  };

  it("extracts the FDP result for a matching parliament", () => {
    const rows = extractFdp(baseDb, (t) => /bundestag/i.test(t));
    expect(rows).toEqual([{ institut: "Forsa", datum: "2026-08-01", fdp: 4.5 }]);
  });

  it("returns an empty array when no parliament matches", () => {
    const rows = extractFdp(baseDb, (t) => /nordrhein/i.test(t));
    expect(rows).toEqual([]);
  });

  it("skips surveys with no FDP result", () => {
    const db = structuredClone(baseDb);
    db.Surveys["100"].Results = { "2": 30 };
    expect(extractFdp(db, (t) => /bundestag/i.test(t))).toEqual([]);
  });

  it("falls back to a generated label when the institute is unknown", () => {
    const db = structuredClone(baseDb);
    db.Surveys["100"].Institute_ID = 999;
    const rows = extractFdp(db, (t) => /bundestag/i.test(t));
    expect(rows[0].institut).toBe("Institut 999");
  });

  it("returns an empty array when there is no FDP party in the dataset", () => {
    const db = structuredClone(baseDb);
    delete db.Parties["1"];
    expect(extractFdp(db, (t) => /bundestag/i.test(t))).toEqual([]);
  });

  it("coerces the FDP result to a number", () => {
    const db = structuredClone(baseDb);
    db.Surveys["100"].Results["1"] = "4.5";
    const rows = extractFdp(db, (t) => /bundestag/i.test(t));
    expect(rows[0].fdp).toBe(4.5);
    expect(typeof rows[0].fdp).toBe("number");
  });
});
