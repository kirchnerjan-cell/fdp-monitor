import { describe, it, expect } from "vitest";
import { isoWeekInfo, groupByWeek, lastNWeeks, countBy } from "../kubicki-utils.js";

describe("isoWeekInfo", () => {
  it("computes the ISO calendar week, Monday–Sunday", () => {
    // Montag, 07.09.2026 ist KW 37.
    expect(isoWeekInfo("2026-09-07")).toMatchObject({ key: "2026-W37", week: 37, year: 2026, start: "2026-09-07", end: "2026-09-13" });
  });

  it("returns the same week for any weekday within it", () => {
    expect(isoWeekInfo("2026-09-10").key).toBe("2026-W37");
    expect(isoWeekInfo("2026-09-13").key).toBe("2026-W37"); // Sonntag
  });

  it("handles the year-boundary edge case (KW1 kann im Vorjahr beginnen)", () => {
    // 01.01.2027 ist ein Freitag, gehört noch zu KW 53/2026.
    expect(isoWeekInfo("2027-01-01").key).toBe("2026-W53");
    // 04.01.2027 (Montag) ist KW 1/2027.
    expect(isoWeekInfo("2027-01-04").key).toBe("2027-W01");
  });

  it("returns null for missing or unparseable dates", () => {
    expect(isoWeekInfo(null)).toBeNull();
    expect(isoWeekInfo(undefined)).toBeNull();
    expect(isoWeekInfo("not-a-date")).toBeNull();
  });
});

describe("groupByWeek", () => {
  it("groups rows by calendar week, sorted chronologically ascending", () => {
    const rows = [
      { datum: "2026-09-10", titel: "b" }, // KW37
      { datum: "2026-08-31", titel: "a" }, // KW36
      { datum: "2026-09-12", titel: "c" }, // KW37
    ];
    const groups = groupByWeek(rows);
    expect(groups.map((g) => g.key)).toEqual(["2026-W36", "2026-W37"]);
    expect(groups[1].items.map((r) => r.titel)).toEqual(["b", "c"]);
  });

  it("skips rows with missing or unparseable dates", () => {
    const rows = [{ datum: null }, { datum: "not-a-date" }, { datum: "2026-09-10" }];
    expect(groupByWeek(rows)).toHaveLength(1);
  });

  it("uses a custom date field", () => {
    const rows = [{ stand: "2026-09-10" }];
    expect(groupByWeek(rows, "stand")).toHaveLength(1);
  });

  it("returns an empty array for no input", () => {
    expect(groupByWeek([])).toEqual([]);
    expect(groupByWeek(undefined)).toEqual([]);
  });
});

describe("lastNWeeks", () => {
  it("returns n consecutive weeks ending with the week of `now`, ascending", () => {
    const now = new Date("2026-09-10T12:00:00Z"); // KW37
    const weeks = lastNWeeks(4, now);
    expect(weeks.map((w) => w.key)).toEqual(["2026-W34", "2026-W35", "2026-W36", "2026-W37"]);
  });

  it("produces weeks even with no underlying data (for a gapless chart axis)", () => {
    const weeks = lastNWeeks(3, new Date("2026-09-10T12:00:00Z"));
    expect(weeks).toHaveLength(3);
    weeks.forEach((w) => expect(w.items).toBeUndefined()); // reine Wochen-Deskriptoren, keine items
  });
});

describe("countBy", () => {
  it("counts rows per value of the given field", () => {
    const rows = [{ sender: "WELT TV" }, { sender: "ZDF" }, { sender: "WELT TV" }];
    expect(countBy(rows, "sender")).toEqual({ "WELT TV": 2, ZDF: 1 });
  });

  it("groups missing/empty values under 'Unbekannt'", () => {
    const rows = [{ sender: "" }, { sender: null }, {}];
    expect(countBy(rows, "sender")).toEqual({ Unbekannt: 3 });
  });

  it("returns an empty object for no input", () => {
    expect(countBy([], "sender")).toEqual({});
    expect(countBy(undefined, "sender")).toEqual({});
  });
});
