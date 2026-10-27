import { describe, it, expect } from "vitest";
import { fmt, dfmt, esc, extractFdp, sortEbenen, filterByAge, filterTrend, rowsNachWahl,
         gruppiereEbenen, tageBis, huerdeText, wahlAbgeschlossen,
         verlaufPunkte, gleitendesMittel, mergeVerlauf } from "../monitor-utils.js";

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
  const NOW = new Date("2026-09-07T12:00:00Z");
  const bund = { id: "bund", wahltermin: null };
  const nrw = { id: "nrw", wahltermin: "2027-04-25" };       // anstehend, spät
  const berlin = { id: "berlin", wahltermin: "2026-09-20" }; // anstehend, bald
  const sachsenAnhalt = { id: "sachsen-anhalt", wahltermin: "2026-09-06" }; // gelaufen (gestern)

  it("always puts Bund first regardless of input order", () => {
    expect(sortEbenen([nrw, bund, berlin], NOW)[0].id).toBe("bund");
  });

  it("orders upcoming elections by ascending Wahltermin", () => {
    const sorted = sortEbenen([nrw, bund, berlin], NOW);
    expect(sorted.map((e) => e.id)).toEqual(["bund", "berlin", "nrw"]);
  });

  it("puts completed elections after all upcoming ones", () => {
    const sorted = sortEbenen([sachsenAnhalt, nrw, bund, berlin], NOW);
    expect(sorted.map((e) => e.id)).toEqual(["bund", "berlin", "nrw", "sachsen-anhalt"]);
  });

  it("orders completed elections most-recent-first", () => {
    const alt = { id: "alt", wahltermin: "2021-09-26" };
    const sorted = sortEbenen([alt, sachsenAnhalt, berlin], NOW);
    expect(sorted.map((e) => e.id)).toEqual(["berlin", "sachsen-anhalt", "alt"]);
  });

  it("counts election day itself as upcoming, not completed", () => {
    const heute = { id: "heute", wahltermin: "2026-09-07" };
    const sorted = sortEbenen([sachsenAnhalt, heute], NOW);
    expect(sorted.map((e) => e.id)).toEqual(["heute", "sachsen-anhalt"]);
  });

  it("puts entries with no Wahltermin last, even after completed ones", () => {
    const noDate = { id: "unbekannt", wahltermin: null };
    const sorted = sortEbenen([noDate, sachsenAnhalt, berlin], NOW);
    expect(sorted.map((e) => e.id)).toEqual(["berlin", "sachsen-anhalt", "unbekannt"]);
  });

  it("keeps data.json order for two elections on the same day", () => {
    const mv = { id: "mv", wahltermin: "2026-09-20" };
    expect(sortEbenen([mv, berlin], NOW).map((e) => e.id)).toEqual(["mv", "berlin"]);
    expect(sortEbenen([berlin, mv], NOW).map((e) => e.id)).toEqual(["berlin", "mv"]);
  });

  it("does not mutate the input array", () => {
    const input = [nrw, bund, sachsenAnhalt];
    const copy = [...input];
    sortEbenen(input, NOW);
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

describe("filterTrend", () => {
  const NOW = new Date("2026-10-12T12:00:00Z");
  const trend = (stand, wert = 6.2) => ({ wert, delta: 0.3, stand });

  it("keeps a fresh trend", () => {
    const t = trend("2026-10-11");
    expect(filterTrend(t, 35, NOW)).toBe(t);
  });

  it("discards a stale trend — the NRW case (26.08., 47 days old)", () => {
    expect(filterTrend(trend("2026-08-26"), 35, NOW)).toBeNull();
  });

  it("keeps a trend exactly at the cutoff", () => {
    const t = trend("2026-09-07"); // exactly 35 days before NOW
    expect(filterTrend(t, 35, NOW)).toBe(t);
  });

  it("discards a trend one day past the cutoff", () => {
    expect(filterTrend(trend("2026-09-06"), 35, NOW)).toBeNull();
  });

  it("agrees with update.py's filter_trend at the cutoff (same day granularity)", () => {
    // NOW liegt mittags; ohne Kürzen auf UTC-Mitternacht wäre der Grenzfall oben
    // in JS und Python unterschiedlich entschieden.
    const spaet = new Date("2026-10-12T23:59:59Z");
    expect(filterTrend(trend("2026-09-07"), 35, spaet)).not.toBeNull();
    expect(filterTrend(trend("2026-09-06"), 35, spaet)).toBeNull();
  });

  it("returns null for an empty trend", () => {
    expect(filterTrend({ wert: null, delta: null, stand: null }, 35, NOW)).toBeNull();
    expect(filterTrend(null, 35, NOW)).toBeNull();
    expect(filterTrend(undefined, 35, NOW)).toBeNull();
  });

  it("returns null when a value has no Stand date", () => {
    expect(filterTrend({ wert: 6.2, delta: null, stand: null }, 35, NOW)).toBeNull();
  });

  it("returns null for an unparseable Stand date", () => {
    expect(filterTrend(trend("irgendwann"), 35, NOW)).toBeNull();
  });

  it("keeps any trend when no max age is configured", () => {
    const t = trend("2019-01-01");
    expect(filterTrend(t, null, NOW)).toBe(t);
    expect(filterTrend(t, undefined, NOW)).toBe(t);
  });

  it("Bund's 21 days is stricter than the Länder's 35", () => {
    const t = trend("2026-09-15"); // 27 days old
    expect(filterTrend(t, 21, NOW)).toBeNull();
    expect(filterTrend(t, 35, NOW)).toBe(t);
  });

  it("does not mutate the trend it is given", () => {
    const t = trend("2026-08-26");
    const copy = { ...t };
    filterTrend(t, 35, NOW);
    expect(t).toEqual(copy);
  });
});

describe("rowsNachWahl", () => {
  const rows = [
    { institut: "pollytix", datum: "2026-10-08", fdp: 3.0 },  // nach der Wahl
    { institut: "Civey", datum: "2026-09-17", fdp: 2.5 },     // davor
    { institut: "Wahltag", datum: "2026-09-20", fdp: 2.0 },   // am Wahltag
  ];

  it("keeps only polls taken after the election day", () => {
    expect(rowsNachWahl(rows, "2026-09-20").map((r) => r.datum)).toEqual(["2026-10-08"]);
  });

  it("counts a poll on the election day itself as belonging to the decided election", () => {
    // Die letzte Umfrage vor einer Wahl erscheint oft am Wahltag selbst.
    expect(rowsNachWahl(rows, "2026-09-20").some((r) => r.datum === "2026-09-20")).toBe(false);
  });

  it("returns every row when no election day is given", () => {
    expect(rowsNachWahl(rows, null)).toHaveLength(3);
    expect(rowsNachWahl(rows, undefined)).toHaveLength(3);
  });

  it("drops rows without a date", () => {
    expect(rowsNachWahl([{ institut: "x", datum: null, fdp: 1 }], "2026-09-20")).toEqual([]);
  });

  it("returns an empty list when every poll predates the election", () => {
    expect(rowsNachWahl(rows, "2026-12-31")).toEqual([]);
  });

  it("handles missing input without throwing", () => {
    expect(rowsNachWahl(null, "2026-09-20")).toEqual([]);
    expect(rowsNachWahl(undefined, null)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const copy = [...rows];
    rowsNachWahl(rows, "2026-09-20");
    expect(rows).toEqual(copy);
  });
});

describe("gruppiereEbenen", () => {
  const NOW = new Date("2026-10-12T12:00:00Z");
  const e = (id, wahltermin, wahlergebnis) => ({ id, wahltermin, wahlergebnis });

  it("splits into Bund, upcoming, past and undated", () => {
    const g = gruppiereEbenen([
      e("nrw", "2027-04-25"), e("bund", null),
      e("berlin", "2026-09-20", { fdp: 2.5 }), e("irgendwo", null),
    ], NOW);
    expect(g.bund.map((x) => x.id)).toEqual(["bund"]);
    expect(g.anstehend.map((x) => x.id)).toEqual(["nrw"]);
    expect(g.gelaufen.map((x) => x.id)).toEqual(["berlin"]);
    expect(g.ohneTermin.map((x) => x.id)).toEqual(["irgendwo"]);
  });

  it("sorts upcoming elections by date, soonest first", () => {
    const g = gruppiereEbenen([e("spaet", "2027-05-30"), e("frueh", "2027-04-18")], NOW);
    expect(g.anstehend.map((x) => x.id)).toEqual(["frueh", "spaet"]);
  });

  it("counts a past date as past even without a result", () => {
    const g = gruppiereEbenen([e("alt", "2026-09-20")], NOW);
    expect(g.gelaufen.map((x) => x.id)).toEqual(["alt"]);
  });

  it("counts a result as past even when the date is still ahead", () => {
    // Kann vorkommen, wenn ein Wahltermin nachträglich korrigiert wird.
    const g = gruppiereEbenen([e("x", "2027-01-01", { fdp: 3.0 })], NOW);
    expect(g.gelaufen.map((x) => x.id)).toEqual(["x"]);
    expect(g.anstehend).toEqual([]);
  });

  it("treats election day itself as upcoming", () => {
    const g = gruppiereEbenen([e("heute", "2026-10-12")], NOW);
    expect(g.anstehend.map((x) => x.id)).toEqual(["heute"]);
  });

  it("never puts an Ebene in two groups", () => {
    const alle = [e("bund", null), e("a", "2027-01-01"), e("b", "2026-01-01"), e("c", null)];
    const g = gruppiereEbenen(alle, NOW);
    const ids = [...g.bund, ...g.anstehend, ...g.gelaufen, ...g.ohneTermin].map((x) => x.id);
    expect(ids.sort()).toEqual(["a", "b", "bund", "c"]);
  });

  it("handles missing input", () => {
    const g = gruppiereEbenen(null, NOW);
    expect(g.bund).toEqual([]);
    expect(g.anstehend).toEqual([]);
  });
});

describe("tageBis", () => {
  const NOW = new Date("2026-10-12T12:00:00Z");

  it("counts whole days to the election", () => {
    expect(tageBis("2027-04-18", NOW)).toBe(188);
  });

  it("returns 0 on election day", () => {
    expect(tageBis("2026-10-12", NOW)).toBe(0);
  });

  it("is negative once the date has passed", () => {
    expect(tageBis("2026-10-11", NOW)).toBe(-1);
  });

  it("ignores the time of day", () => {
    // Kurz vor Mitternacht muss dasselbe herauskommen wie mittags.
    expect(tageBis("2026-10-20", new Date("2026-10-12T23:59:00Z"))).toBe(8);
    expect(tageBis("2026-10-20", new Date("2026-10-12T00:01:00Z"))).toBe(8);
  });

  it("returns null without a usable date", () => {
    expect(tageBis(null, NOW)).toBeNull();
    expect(tageBis("", NOW)).toBeNull();
    expect(tageBis("irgendwann", NOW)).toBeNull();
  });
});

describe("huerdeText", () => {
  it("names the gap below the threshold", () => {
    expect(huerdeText(3.8)).toEqual({
      status: "unter", kurz: "unter der Hürde", lang: "1,2 Punkte unter der 5-%-Hürde" });
  });

  it("names the gap above the threshold", () => {
    expect(huerdeText(6.2).status).toBe("ueber");
    expect(huerdeText(6.2).lang).toBe("1,2 Punkte über der 5-%-Hürde");
  });

  it("calls exactly five percent 'auf der Hürde'", () => {
    expect(huerdeText(5).status).toBe("auf");
    expect(huerdeText(5).lang).toBe("genau auf der 5-%-Hürde");
  });

  it("does not call a value that displays as 5,0 % 'unter der Hürde'", () => {
    // 4,98 wird als "5,0 %" angezeigt – dann wäre "unter der Hürde" ein Widerspruch.
    expect(huerdeText(4.98).status).toBe("auf");
    expect(huerdeText(5.02).status).toBe("auf");
    expect(huerdeText(4.9).status).toBe("unter");
    expect(huerdeText(5.1).status).toBe("ueber");
  });

  it("reports missing data instead of guessing", () => {
    expect(huerdeText(null).status).toBe("keine");
    expect(huerdeText(undefined).kurz).toBe("keine Daten");
  });
});

describe("wahlAbgeschlossen", () => {
  it("is true once a final official result stands", () => {
    expect(wahlAbgeschlossen({ wahlergebnis: { fdp: 2.6, datum: "2026-09-06" } })).toBe(true);
  });

  it("is false while the result is only preliminary", () => {
    // Bis zur Feststellung durch den Landeswahlausschuss läuft die Abfrage weiter.
    expect(wahlAbgeschlossen({ wahlergebnis: { fdp: 2.5, datum: "2026-09-20", vorlaeufig: true } })).toBe(false);
  });

  it("is false without a result", () => {
    expect(wahlAbgeschlossen({ wahlergebnis: null })).toBe(false);
    expect(wahlAbgeschlossen({})).toBe(false);
    expect(wahlAbgeschlossen(null)).toBe(false);
  });

  it("is false for a result that carries no value", () => {
    expect(wahlAbgeschlossen({ wahlergebnis: { datum: "2026-09-06" } })).toBe(false);
  });

  it("agrees with update.py's abgeschlossen() on the same cases", () => {
    // Beide Seiten müssen dieselbe Ebene gleich einstufen, sonst zeigt die Seite
    // Umfragen, die das Skript längst verworfen hat (oder umgekehrt).
    const faelle = [
      [{ wahlergebnis: { fdp: 2.6, datum: "2026-09-06" } }, true],
      [{ wahlergebnis: { fdp: 2.5, datum: "2026-09-20", vorlaeufig: true } }, false],
      [{ wahlergebnis: null }, false],
      [{}, false],
    ];
    for (const [ebene, erwartet] of faelle) expect(wahlAbgeschlossen(ebene)).toBe(erwartet);
  });
});

describe("verlaufPunkte", () => {
  const NOW = new Date("2026-10-24T12:00:00Z");
  const r = (datum, fdp, institut = "INSA") => ({ institut, datum, fdp });

  it("keeps only the window and sorts oldest first", () => {
    const p = verlaufPunkte([r("2026-10-20", 4), r("2026-01-01", 9.9), r("2026-09-01", 3)], 90, NOW);
    expect(p.map((x) => x.v)).toEqual([3, 4]);
  });

  it("keeps a poll exactly at the window edge", () => {
    expect(verlaufPunkte([r("2026-07-26", 4)], 90, NOW)).toHaveLength(1);   // genau 90 Tage
    expect(verlaufPunkte([r("2026-07-25", 4)], 90, NOW)).toHaveLength(0);
  });

  it("ignores a poll dated in the future", () => {
    // Ein Tippfehler im Datum darf die Zeitachse nicht nach rechts aufreissen.
    expect(verlaufPunkte([r("2027-01-01", 4)], 90, NOW)).toEqual([]);
  });

  it("drops rows without a usable date or value", () => {
    const p = verlaufPunkte([r(null, 4), r("keins", 4), r("2026-10-20", null), r("2026-10-20", 4)], 90, NOW);
    expect(p).toHaveLength(1);
  });

  it("orders several polls of the same day by institute, stably", () => {
    const p = verlaufPunkte([r("2026-10-20", 4, "Forsa"), r("2026-10-20", 5, "Allensbach")], 90, NOW);
    expect(p.map((x) => x.institut)).toEqual(["Allensbach", "Forsa"]);
  });

  it("ignores the time of day", () => {
    const spaet = verlaufPunkte([r("2026-07-26", 4)], 90, new Date("2026-10-24T23:59:00Z"));
    const frueh = verlaufPunkte([r("2026-07-26", 4)], 90, new Date("2026-10-24T00:01:00Z"));
    expect(spaet).toHaveLength(frueh.length);
  });
});

describe("gleitendesMittel", () => {
  const NOW = new Date("2026-10-24T12:00:00Z");
  const p = (rows) => verlaufPunkte(rows, 90, NOW);

  it("averages every poll inside the 14-day window", () => {
    const l = gleitendesMittel(p([
      { institut: "GMS", datum: "2026-10-10", fdp: 3 },
      { institut: "INSA", datum: "2026-10-20", fdp: 4 },
      { institut: "Forsa", datum: "2026-10-20", fdp: 5 },
    ]), 14);
    expect(l).toHaveLength(2);
    expect(l[0].v).toBeCloseTo(3, 5);
    expect(l[1].v).toBeCloseTo(4, 5);     // (3 + 4 + 5) / 3
    expect(l[1].n).toBe(3);
  });

  it("drops a poll once it is older than the window", () => {
    const l = gleitendesMittel(p([
      { institut: "Alt", datum: "2026-10-01", fdp: 9 },
      { institut: "Neu", datum: "2026-10-20", fdp: 4 },   // 19 Tage später
    ]), 14);
    expect(l[1].v).toBeCloseTo(4, 5);
    expect(l[1].n).toBe(1);
  });

  it("still counts a poll exactly at the window edge", () => {
    const l = gleitendesMittel(p([
      { institut: "Rand", datum: "2026-10-06", fdp: 2 },
      { institut: "Neu", datum: "2026-10-20", fdp: 4 },   // genau 14 Tage später
    ]), 14);
    expect(l[1].n).toBe(2);
    expect(l[1].v).toBeCloseTo(3, 5);
  });

  it("gives one line point per day that has polls", () => {
    const l = gleitendesMittel(p([
      { institut: "A", datum: "2026-10-20", fdp: 4 },
      { institut: "B", datum: "2026-10-20", fdp: 4 },
    ]), 14);
    expect(l).toHaveLength(1);
  });

  it("weights every poll the same — that is what the source line claims", () => {
    // Zwei Umfragen eines Instituts am selben Tag zählen doppelt, nicht einmal.
    const l = gleitendesMittel(p([
      { institut: "A", datum: "2026-10-20", fdp: 2 },
      { institut: "B", datum: "2026-10-20", fdp: 2 },
      { institut: "C", datum: "2026-10-20", fdp: 8 },
    ]), 14);
    expect(l[0].v).toBeCloseTo(4, 5);
  });
});

describe("mergeVerlauf", () => {
  const g = [{ institut: "INSA", datum: "2026-10-13", fdp: 5 }];
  const live = [{ institut: "INSA", datum: "2026-10-20", fdp: 4 }];

  it("combines stored and live rows", () => {
    expect(mergeVerlauf(g, live)).toHaveLength(2);
  });

  it("counts the same poll once — otherwise it would skew the average", () => {
    const doppelt = [{ institut: "INSA", datum: "2026-10-13", fdp: 5 }];
    expect(mergeVerlauf(g, doppelt)).toHaveLength(1);
  });

  it("lets the live value win for the same institute and day", () => {
    // dawum korrigiert einen Wert gelegentlich nach – dann gilt der frische.
    const korrigiert = [{ institut: "INSA", datum: "2026-10-13", fdp: 6 }];
    expect(mergeVerlauf(g, korrigiert)[0].fdp).toBe(6);
  });

  it("keeps two institutes on the same day apart", () => {
    expect(mergeVerlauf(g, [{ institut: "Forsa", datum: "2026-10-13", fdp: 3 }])).toHaveLength(2);
  });

  it("handles missing input", () => {
    expect(mergeVerlauf(null, null)).toEqual([]);
    expect(mergeVerlauf(g, null)).toHaveLength(1);
    expect(mergeVerlauf(null, live)).toHaveLength(1);
  });

  it("skips rows without a date instead of keying them together", () => {
    expect(mergeVerlauf([{ institut: "X", datum: null, fdp: 1 }], live)).toHaveLength(1);
  });
});
