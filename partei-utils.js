/* Reine Hilfsfunktionen für partei.html (Kennzahlen, Themen-Auswertung, Zeitleiste).
   In eigener Datei, damit sie ohne Browser/DOM getestet werden können. */
(function (root) {
  "use strict";

  /* Bestwert, letzte Wahl und Zahl der Wahlen unter der Hürde. */
  function kennzahlen(wahlen, huerde) {
    const rows = (wahlen || []).filter((w) => w && w.ergebnis != null);
    if (!rows.length) return null;
    const best = rows.reduce((a, b) => (b.ergebnis > a.ergebnis ? b : a));
    const letzte = rows.reduce((a, b) => (b.jahr > a.jahr ? b : a));
    return {
      best, letzte,
      unter: rows.filter((w) => w.ergebnis < (huerde == null ? 5 : huerde)).length,
      anzahl: rows.length,
    };
  }

  /* Mittlere Gewichtung je Thema in einem frühen und einem späten Zeitraum und die
     Differenz, größte Zunahme zuerst. bisFrueh/abHeute sind inklusive Jahresgrenzen. */
  function verschiebung(themen, bisFrueh, abHeute) {
    const jahre = (themen && themen.jahre) || [];
    const mittel = (g, pruef) => {
      const w = g.filter((_, i) => pruef(jahre[i]));
      return w.length ? w.reduce((s, x) => s + x, 0) / w.length : null;
    };
    return ((themen && themen.liste) || [])
      .map((t) => {
        const frueh = mittel(t.gewicht, (j) => j <= bisFrueh);
        const heute = mittel(t.gewicht, (j) => j >= abHeute);
        return { thema: t.thema, frueh, heute, differenz: frueh == null || heute == null ? null : heute - frueh };
      })
      .filter((r) => r.differenz != null)
      .sort((a, b) => b.differenz - a.differenz || a.thema.localeCompare(b.thema, "de"));
  }

  /* "YYYY-MM" oder "YYYY-MM-DD" -> Zeitstempel (UTC). */
  function monat(s) {
    const [y, m, d] = String(s).split("-").map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  }

  /* Zeitleisten-Einträge auf das Fenster [von, bis] beschneiden. bis: null heißt
     "läuft noch" und endet am Fensterende. Einträge ganz außerhalb fallen weg. */
  function zeitBalken(eintraege, von, bis) {
    return (eintraege || [])
      .map((e) => {
        const a = monat(e.von), b = e.bis == null ? bis : monat(e.bis);
        return { ...e, a, b, laeuft: e.bis == null, x0: Math.max(a, von), x1: Math.min(b, bis) };
      })
      .filter((e) => e.x1 > e.x0);
  }

  /* Amtsdauer je Vorsitzendem in Jahren (Tage / 365,25, eine Nachkommastelle).
     ende: null heißt "amtiert noch" und zählt bis heute. */
  function amtszeiten(vorsitzende, heute) {
    const jetzt = heute == null ? Date.now() : +heute;
    return (vorsitzende || []).map((v) => {
      const a = monat(v.beginn), b = v.ende == null ? jetzt : monat(v.ende);
      return { ...v, a, b, laufend: v.ende == null, jahre: Math.round((b - a) / 864e5 / 365.25 * 10) / 10 };
    });
  }

  /* Längste und kürzeste Amtszeit sowie Mittel. Die laufende Amtszeit zählt für die
     längste mit, nicht aber für kürzeste und Mittel: sie ist noch nicht zu Ende. */
  function amtsKennzahlen(zeiten) {
    const abg = (zeiten || []).filter((z) => !z.laufend);
    if (!abg.length) return null;
    return {
      anzahl: zeiten.length,
      laengste: zeiten.reduce((a, b) => (b.jahre > a.jahre ? b : a)),
      kuerzeste: abg.reduce((a, b) => (b.jahre < a.jahre ? b : a)),
      mittel: Math.round(abg.reduce((s, z) => s + z.jahre, 0) / abg.length * 10) / 10,
      amtierend: zeiten.find((z) => z.laufend) || null,
    };
  }

  const api = { kennzahlen, verschiebung, monat, zeitBalken, amtszeiten, amtsKennzahlen };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ParteiUtils = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
