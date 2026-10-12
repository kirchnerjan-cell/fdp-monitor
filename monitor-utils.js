/* Reine Hilfsfunktionen für index.html (Formatierung, Escaping, dawum-Extraktion).
   In eigener Datei, damit sie ohne Browser/DOM getestet werden können. */
(function (root) {
  "use strict";

  function fmt(n) {
    return (Math.round(n * 10) / 10).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function dfmt(s) {
    if (!s) return "";
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function extractFdp(db, parlMatch) {
    const parties = db.Parties || {}, parls = db.Parliaments || {}, insts = db.Institutes || {};
    const fdpId = Object.keys(parties).find((k) => (parties[k].Shortcut || "").toUpperCase() === "FDP");
    const parlIds = Object.keys(parls).filter((k) => parlMatch((parls[k].Shortcut || "") + " " + (parls[k].Name || "")));
    const out = [];
    for (const s of Object.values(db.Surveys || {})) {
      if (!parlIds.includes(String(s.Parliament_ID))) continue;
      const v = s.Results && s.Results[fdpId];
      if (v == null) continue;
      out.push({ institut: (insts[s.Institute_ID] || {}).Name || "Institut " + s.Institute_ID, datum: s.Date, fdp: Number(v) });
    }
    return out;
  }

  function filterByAge(rows, maxAgeDays, now) {
    if (maxAgeDays == null) return rows;
    now = now || new Date();
    // Vergleich auf Tagesebene (UTC-Mitternacht), damit "genau N Tage alt" wie in
    // update.py's filter_by_age() (das mit date-Objekten ohne Uhrzeit rechnet) zählt.
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    cutoff.setUTCDate(cutoff.getUTCDate() - maxAgeDays);
    return rows.filter((r) => {
      if (!r.datum) return false;
      const d = new Date(r.datum);
      return !isNaN(d) && d >= cutoff;
    });
  }

  /* Einen Wahltrend verwerfen, der zu alt ist, damit er nicht dauerhaft als Leitzahl
     stehen bleibt. Nötig, weil dawum den Wahltrend einer Ebene nicht mehr ausweist,
     sobald dort länger keine Umfragen erscheinen: die Routine findet dann keinen Wert
     mehr, der zuletzt gespeicherte würde ohne diese Prüfung ewig weitergezeigt.
     Gibt den Trend zurück, wenn er verwertbar ist, sonst null. */
  function filterTrend(trend, maxAgeDays, now) {
    if (!trend || trend.wert == null) return null;
    if (maxAgeDays == null) return trend;
    if (!trend.stand) return null; // ohne Stand nicht datierbar, also nicht als Leitzahl
    now = now || new Date();
    // Tagesebene (UTC-Mitternacht) wie in filterByAge, damit JS und update.py gleich rechnen.
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    cutoff.setUTCDate(cutoff.getUTCDate() - maxAgeDays);
    const d = new Date(trend.stand);
    return !isNaN(d) && d >= cutoff ? trend : null;
  }

  /* Nach einer gelaufenen Wahl zählen nur die Umfragen, die nach dem Wahltag erhoben
     wurden: die älteren betreffen eine entschiedene Frage. Beide in einen Mittelwert zu
     legen ergibt keine aussagekräftige Zahl. Der Wahltag selbst gehört zur alten Wahl. */
  function rowsNachWahl(rows, wahltag) {
    if (!wahltag) return rows || [];
    return (rows || []).filter((r) => r.datum && r.datum > wahltag);
  }

  /* Reihenfolge der Panels: Bundesebene immer zuerst, dann die anstehenden Wahlen
     (nächster Termin zuerst), danach die bereits gelaufenen (zuletzt gewählte zuerst),
     ganz am Ende Ebenen ohne Wahltermin. Der Wahltag selbst zählt noch als anstehend. */
  function sortEbenen(ebenen, now) {
    now = now || new Date();
    const heute = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString()
      .slice(0, 10);
    const bund = ebenen.filter((e) => e.id === "bund");
    const rest = ebenen.filter((e) => e.id !== "bund");
    const anstehend = rest
      .filter((e) => e.wahltermin != null && e.wahltermin >= heute)
      .sort((a, b) => a.wahltermin.localeCompare(b.wahltermin));
    const gelaufen = rest
      .filter((e) => e.wahltermin != null && e.wahltermin < heute)
      .sort((a, b) => b.wahltermin.localeCompare(a.wahltermin));
    const ohneTermin = rest.filter((e) => e.wahltermin == null);
    return [...bund, ...anstehend, ...gelaufen, ...ohneTermin];
  }

  /* Tagesgenaues Heute als ISO-Datum (UTC-Mitternacht), wie filterByAge und sortEbenen
     es benutzen – damit alle Datumsvergleiche dieselbe Grenze ziehen. */
  function heuteIso(now) {
    now = now || new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString()
      .slice(0, 10);
  }

  /* Die Ebenen in die vier Blöcke der Seite teilen. Maßgeblich für "gelaufen" ist ein
     vorhandenes amtliches Ergebnis oder ein Wahltermin in der Vergangenheit – der
     Wahltag selbst zählt noch als anstehend (wie in sortEbenen). */
  function gruppiereEbenen(ebenen, now) {
    const heute = heuteIso(now);
    const sortiert = sortEbenen(ebenen || [], now);
    const gelaufen = (e) =>
      (e.wahlergebnis && e.wahlergebnis.fdp != null) || (e.wahltermin != null && e.wahltermin < heute);
    return {
      bund: sortiert.filter((e) => e.id === "bund"),
      anstehend: sortiert.filter((e) => e.id !== "bund" && e.wahltermin != null && !gelaufen(e)),
      gelaufen: sortiert.filter((e) => e.id !== "bund" && gelaufen(e)),
      ohneTermin: sortiert.filter((e) => e.id !== "bund" && e.wahltermin == null && !gelaufen(e)),
    };
  }

  /* Volle Tage von heute bis zum Wahltermin. 0 = heute, null wenn kein Termin. */
  function tageBis(wahltermin, now) {
    if (!wahltermin) return null;
    const ziel = new Date(wahltermin + "T00:00:00Z");
    if (isNaN(ziel)) return null;
    return Math.round((ziel - new Date(heuteIso(now) + "T00:00:00Z")) / 86400000);
  }

  /* Lage zur 5-%-Hürde, als Kurzform für Kacheln und als Satz für die Leitzahl.
     Toleranz 0,05, weil überall auf eine Dezimale gerundet angezeigt wird: ein Wert,
     der als "5,0 %" erscheint, darf nicht "unter der Hürde" heißen. */
  function huerdeText(wert) {
    if (wert == null) return { status: "keine", kurz: "keine Daten", lang: "keine Umfragedaten" };
    const diff = wert - 5;
    if (Math.abs(diff) < 0.05) return { status: "auf", kurz: "auf der Hürde", lang: "genau auf der 5-%-Hürde" };
    const punkte = fmt(Math.abs(diff)) + " Punkte";
    return diff < 0
      ? { status: "unter", kurz: "unter der Hürde", lang: punkte + " unter der 5-%-Hürde" }
      : { status: "ueber", kurz: "über der Hürde", lang: punkte + " über der 5-%-Hürde" };
  }

  const api = { fmt, dfmt, esc, extractFdp, sortEbenen, filterByAge, filterTrend, rowsNachWahl, gruppiereEbenen, tageBis, huerdeText };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MonitorUtils = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
