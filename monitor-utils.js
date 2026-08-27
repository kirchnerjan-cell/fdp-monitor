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

  const api = { fmt, dfmt, esc, extractFdp };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MonitorUtils = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
