#!/usr/bin/env python3
"""
Kubicki-Monitor – Wochen-Statistik (nur Python-Standardbibliothek).

Python-Gegenstück zu kubicki-utils.js: gleiche ISO-Kalenderwochen-Logik,
für die Claude-Code-Routine (Validierung + Wochen-Report).

Aufruf:  python3 kubicki_stats.py [--wochen N]
"""
import argparse
import json, os
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "kubicki-data.json")


def load_data():
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)


def _parse_date(s):
    try:
        return date.fromisoformat(s)
    except (TypeError, ValueError):
        return None


def iso_week_info(date_str):
    """ISO-8601-Kalenderwoche (Montag–Sonntag) für ein YYYY-MM-DD-Datum, oder None."""
    d = _parse_date(date_str)
    if d is None:
        return None
    year, week, _ = d.isocalendar()
    start = date.fromisocalendar(year, week, 1)
    end = date.fromisocalendar(year, week, 7)
    return {"key": f"{year}-W{week:02d}", "week": week, "year": year,
            "start": start.isoformat(), "end": end.isoformat()}


def group_by_week(rows, date_field="datum"):
    """Gruppiert rows nach Kalenderwoche, chronologisch aufsteigend sortiert.
    Rows ohne gültiges Datum werden übersprungen."""
    by_key = {}
    for row in rows or []:
        info = iso_week_info(row.get(date_field))
        if info is None:
            continue
        by_key.setdefault(info["key"], {**info, "items": []})["items"].append(row)
    return [by_key[k] for k in sorted(by_key)]


def last_n_weeks(n, today=None):
    """Die letzten n Kalenderwochen bis einschließlich der Woche von `today`, aufsteigend."""
    today = today or date.today()
    return [iso_week_info((today - timedelta(days=i * 7)).isoformat()) for i in range(n - 1, -1, -1)]


def count_by(rows, field):
    """Zählt rows je Wert von field."""
    out = {}
    for row in rows or []:
        key = row.get(field) or "Unbekannt"
        out[key] = out.get(key, 0) + 1
    return out


def report(d, wochen=8, today=None):
    """Textreport der letzten `wochen` Kalenderwochen: Beiträge und bestätigte Interviews je Woche."""
    weeks = last_n_weeks(wochen, today)
    beitraege_by_week = {g["key"]: g for g in group_by_week(d.get("beitraege", []))}
    interviews = d.get("interviews", [])
    bestaetigt = [i for i in interviews if i.get("status", "bestaetigt") == "bestaetigt"]
    vorschlaege = [i for i in interviews if i.get("status") == "vorschlag"]
    interviews_by_week = {g["key"]: g for g in group_by_week(bestaetigt)}

    lines = []
    for w in weeks:
        b = beitraege_by_week.get(w["key"])
        iv = interviews_by_week.get(w["key"])
        b_n = len(b["items"]) if b else 0
        iv_items = iv["items"] if iv else []
        sender_txt = ", ".join(f"{k}: {v}" for k, v in sorted(count_by(iv_items, "sender").items())) or "–"
        lines.append(f"{w['key']} ({w['start']}–{w['end']}): {b_n} Beitrag/Beiträge, "
                      f"{len(iv_items)} Interview(s) [{sender_txt}]")
    if vorschlaege:
        lines.append(f"\n{len(vorschlaege)} unbestätigte(r) Interview-Vorschlag/Vorschläge – "
                      "bitte in kubicki-data.json prüfen (status \"vorschlag\").")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wochen", type=int, default=8, help="Anzahl der Wochen im Report (Standard: 8)")
    a = ap.parse_args()
    print(report(load_data(), a.wochen))


if __name__ == "__main__":
    main()
