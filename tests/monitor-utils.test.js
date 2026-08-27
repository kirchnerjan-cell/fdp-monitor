import { describe, it, expect } from "vitest";
import { fmt, dfmt, esc, extractFdp, sortEbenen, filterByAge } from "../monitor-utils.js";

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

describe("sortEbenen", () => {
  const bund = { id: "bund", wahltermin: null };
  const nrw = { id: "nrw", wahltermin: "2027-05-09" };
  const berlin = { id: "berlin", wahltermin: "2026-09-13" };
  const sachsenAnhalt = { id: "sachsen-anhalt", wahltermin: "2026-06-07" };

  it("always puts Bund first regardless of input order", () => {
    const sorted = sortEbenen([nrw, bund, berlin]);
    expect(sorted[0].id).toBe("bund");
  });

  it("orders the remaining Länder by ascending Wahltermin", () => {
    const sorted = sortEbenen([nrw, bund, berlin, sachsenAnhalt]);
    expect(sorted.map((e) => e.id)).toEqual(["bund", "sachsen-anhalt", "berlin", "nrw"]);
  });

  it("puts entries with no Wahltermin after dated ones", () => {
    const noDate = { id: "unbekannt", wahltermin: null };
    const sorted = sortEbenen([noDate, sachsenAnhalt]);
    expect(sorted.map((e) => e.id)).toEqual(["sachsen-anhalt", "unbekannt"]);
  });

  it("does not mutate the input array", () => {
    const input = [nrw, bund, sachsenAnhalt];
    const copy = [...input];
    sortEbenen(input);
    expect(input).toEqual(copy);
  });
});

describe("filterByAge", () => {
  const NOW = new Date("2026-08-27T12:00:00Z");
  const rows = (...dates) => dates.map((datum) => ({ institut: "Institut", datum, fdp: 5.0 }));

  it("returns all rows unfiltered when maxAgeDays is null", () => {
    const input = rows("2020-01-01", "2026-08-20");
    expect(filterByAge(input, null, NOW)).toEqual(input);
  });

  it("drops rows older than maxAgeDays", () => {
    const out = filterByAge(rows("2026-08-20", "2025-01-01"), 60, NOW);
    expect(out.map((r) => r.datum)).toEqual(["2026-08-20"]);
  });

  it("keeps a row exactly at the cutoff", () => {
    const out = filterByAge(rows("2026-06-28"), 60, NOW); // exactly 60 days before NOW
    expect(out).toHaveLength(1);
  });

  it("drops rows with a missing or unparseable date", () => {
    const out = filterByAge([{ institut: "x", datum: null, fdp: 1 }, { institut: "y", datum: "not-a-date", fdp: 1 }, ...rows("2026-08-20")], 60, NOW);
    expect(out.map((r) => r.datum)).toEqual(["2026-08-20"]);
  });

  it("60 vs 180 day windows behave differently for the same row", () => {
    const input = rows("2026-04-01"); // ~148 days before NOW
    expect(filterByAge(input, 60, NOW)).toEqual([]);
    expect(filterByAge(input, 180, NOW)).toHaveLength(1);
  });

  it("does not mutate the input array", () => {
    const input = rows("2020-01-01", "2026-08-20");
    const copy = [...input];
    filterByAge(input, 60, NOW);
    expect(input).toEqual(copy);
  });
});
