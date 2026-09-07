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

  const api = { fmt, dfmt, esc, extractFdp, sortEbenen, filterByAge };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MonitorUtils = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
