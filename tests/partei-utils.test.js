import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { kennzahlen, verschiebung, monat, zeitBalken, amtszeiten, amtsKennzahlen } from "../partei-utils.js";

const WAHLEN = [
  { jahr: 2009, ergebnis: 14.6 },
  { jahr: 2013, ergebnis: 4.8 },
  { jahr: 2021, ergebnis: 11.5 },
  { jahr: 2025, ergebnis: 4.3 },
];

describe("kennzahlen", () => {
  it("finds best and latest result and counts results below the threshold", () => {
    const k = kennzahlen(WAHLEN);
    expect(k.best.jahr).toBe(2009);
    expect(k.letzte.jahr).toBe(2025);
    expect(k.unter).toBe(2);
    expect(k.anzahl).toBe(4);
  });

  it("does not depend on input order", () => {
    expect(kennzahlen(WAHLEN.slice().reverse()).letzte.jahr).toBe(2025);
  });

  it("counts exactly 5 % as passing", () => {
    expect(kennzahlen([{ jahr: 2000, ergebnis: 5 }]).unter).toBe(0);
  });

  it("returns null without results", () => {
    expect(kennzahlen([])).toBeNull();
    expect(kennzahlen(null)).toBeNull();
  });
});

describe("verschiebung", () => {
  const themen = {
    jahre: [1998, 2005, 2021, 2025],
    liste: [
      { thema: "Steigt", gewicht: [0, 1, 3, 3] },
      { thema: "Fällt", gewicht: [2, 2, 1, 1] },
      { thema: "Gleich", gewicht: [2, 2, 2, 2] },
    ],
  };

  it("averages both periods and sorts by change, largest increase first", () => {
    const r = verschiebung(themen, 2005, 2021);
    expect(r.map((x) => x.thema)).toEqual(["Steigt", "Gleich", "Fällt"]);
    expect(r[0]).toMatchObject({ frueh: 0.5, heute: 3, differenz: 2.5 });
    expect(r[2].differenz).toBe(-1);
  });

  it("drops topics without values in one of the periods", () => {
    expect(verschiebung(themen, 1990, 2021)).toEqual([]);
  });
});

describe("zeitBalken", () => {
  const von = monat("2000-01"), bis = monat("2020-01");

  it("clips entries to the window", () => {
    const [e] = zeitBalken([{ von: "1995-06", bis: "2005-01" }], von, bis);
    expect(e.x0).toBe(von);
    expect(e.x1).toBe(monat("2005-01"));
  });

  it("runs open entries (bis: null) to the window end", () => {
    const [e] = zeitBalken([{ von: "2015-01", bis: null }], von, bis);
    expect(e.laeuft).toBe(true);
    expect(e.x1).toBe(bis);
  });

  it("drops entries outside the window", () => {
    expect(zeitBalken([{ von: "1980-01", bis: "1990-01" }], von, bis)).toEqual([]);
  });
});

describe("amtszeiten / amtsKennzahlen", () => {
  const V = [
    { nr: 1, name: "A", beginn: "2000-01-01", ende: "2010-01-01" },
    { nr: 2, name: "B", beginn: "2010-01-01", ende: "2011-01-01" },
    { nr: 3, name: "C", beginn: "2011-01-01", ende: null },
  ];
  const heute = Date.UTC(2041, 0, 1);

  it("computes terms in years and runs the current one until today", () => {
    const z = amtszeiten(V, heute);
    expect(z.map((x) => x.jahre)).toEqual([10, 1, 30]);
    expect(z[2].laufend).toBe(true);
  });

  it("counts the current term for the longest, not for shortest or mean", () => {
    const k = amtsKennzahlen(amtszeiten(V, heute));
    expect(k.anzahl).toBe(3);
    expect(k.laengste.name).toBe("C");
    expect(k.kuerzeste.name).toBe("B");
    expect(k.mittel).toBe(5.5);
    expect(k.amtierend.name).toBe("C");
  });

  it("returns null without completed terms", () => {
    expect(amtsKennzahlen(amtszeiten([V[2]], heute))).toBeNull();
  });
});

describe("partei.json", () => {
  const d = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "partei.json"), "utf-8"));

  it("has one weight and one position per programme year for every topic", () => {
    for (const t of d.themen.liste) {
      expect(t.gewicht).toHaveLength(d.themen.jahre.length);
      expect(t.position).toHaveLength(d.themen.jahre.length);
      for (const g of t.gewicht) expect(g >= 0 && g < d.themen.skala.length).toBe(true);
    }
  });

  it("lists chairs without gaps: each term starts when the previous one ends", () => {
    const v = d.vorsitzende;
    v.slice(1).forEach((x, i) => expect(x.beginn).toBe(v[i].ende));
    expect(v.filter((x) => x.ende == null)).toHaveLength(1);
    expect(v[v.length - 1].ende).toBeNull();
  });

  it("has a programme year for every federal election", () => {
    expect(d.wahlen.map((w) => w.jahr)).toEqual(d.themen.jahre);
  });
});
