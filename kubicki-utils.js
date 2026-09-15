/* Reine Hilfsfunktionen für kubicki.html (ISO-Kalenderwochen, Gruppierung).
   In eigener Datei, damit sie ohne Browser/DOM getestet werden können.
   esc/fmt/dfmt kommen aus monitor-utils.js (dort schon vorhanden). */
(function (root) {
  "use strict";

  const DAY = 86400000;
  const pad2 = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

  /* ISO-8601-Kalenderwoche (Montag–Sonntag, KW 1 enthält den ersten Donnerstag des Jahres). */
  function isoWeekInfo(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNr = (day.getUTCDay() + 6) % 7; // Montag=0 .. Sonntag=6

    const thursday = new Date(day);
    thursday.setUTCDate(day.getUTCDate() - dayNr + 3);
    const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
    const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
    const week = 1 + Math.round((thursday - firstThursday) / (7 * DAY));

    const monday = new Date(day);
    monday.setUTCDate(day.getUTCDate() - dayNr);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    return { key: `${thursday.getUTCFullYear()}-W${pad2(week)}`, week, year: thursday.getUTCFullYear(), start: iso(monday), end: iso(sunday) };
  }

  /* Gruppiert rows[dateField] nach Kalenderwoche. Rows ohne gültiges Datum werden übersprungen.
     Ergebnis chronologisch aufsteigend sortiert. */
  function groupByWeek(rows, dateField) {
    dateField = dateField || "datum";
    const byKey = new Map();
    for (const row of rows || []) {
      const info = isoWeekInfo(row[dateField]);
      if (!info) continue;
      if (!byKey.has(info.key)) byKey.set(info.key, { ...info, items: [] });
      byKey.get(info.key).items.push(row);
    }
    return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  /* Die letzten n Kalenderwochen bis einschließlich der Woche von `now`, aufsteigend,
     auch wenn dafür keine Daten vorliegen (für eine lückenlose Balken-Achse). */
  function lastNWeeks(n, now) {
    now = now || new Date();
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() - i * 7);
      out.push(isoWeekInfo(iso(d)));
    }
    return out;
  }

  /* Zählt rows je Wert von field (z. B. "sender"). */
  function countBy(rows, field) {
    const out = {};
    for (const row of rows || []) {
      const key = row[field] || "Unbekannt";
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  }

  const api = { isoWeekInfo, groupByWeek, lastNWeeks, countBy };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.KubickiUtils = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
