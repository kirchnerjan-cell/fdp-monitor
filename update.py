#!/usr/bin/env python3
"""
FDP-Monitor – Aktualisierungsskript (nur Python-Standardbibliothek).

Aufruf:  python3 update.py
Ergebnis:
  1. Die neuesten FDP-Umfragen für jede Ebene aus data.json["ebenen"] werden von
     api.dawum.de gespeichert – als Fallback, falls der Browser die API nicht direkt
     erreichen kann. Umfragen älter als data.json["ebenen"][*]["umfrage_max_alter_tage"]
     Tage (Standard: kein Limit) werden dabei aussortiert.
  2. Optional: dawum-Wahltrend je Ebene setzen (gewichteter Durchschnitt, steht nicht in
     der API):
       python3 update.py --trend bund 4.4 --trend nrw 5.6
     (Ebene-IDs stehen in data.json["ebenen"][*]["id"].) Δ zur Vorwoche wird aus dem
     bisher gespeicherten Wert berechnet; --stand YYYY-MM-DD überschreibt das
     Stand-Datum (Standard: heute).
  3. "erstellt" wird auf jetzt gesetzt.
"""
import argparse
import json, re, os, urllib.request
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data.json")
DAWUM = "https://api.dawum.de/newest_surveys.json"
UA = "Mozilla/5.0 (fdp-monitor; github-pages)"
TZ = timezone(timedelta(hours=2))  # Europa/Berlin (Sommerzeit); nur für "erstellt"

def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def load_data():
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)

def save_data(d):
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")

def fdp_rows(db, parl_regex):
    parties = db.get("Parties", {}); parls = db.get("Parliaments", {}); insts = db.get("Institutes", {})
    fdp = next((k for k, v in parties.items() if (v.get("Shortcut") or "").upper() == "FDP"), None)
    pids = {k for k, v in parls.items() if re.search(parl_regex, f"{v.get('Shortcut','')} {v.get('Name','')}", re.I)}
    rows = []
    for s in db.get("Surveys", {}).values():
        if str(s.get("Parliament_ID")) not in pids:
            continue
        v = (s.get("Results") or {}).get(fdp)
        if v is None:
            continue
        rows.append({"institut": insts.get(str(s.get("Institute_ID")), {}).get("Name", "?"),
                     "datum": s.get("Date"), "fdp": float(v)})
    return sorted(rows, key=lambda r: r["datum"] or "", reverse=True)

def filter_by_age(rows, max_age_days, today=None):
    """Umfragen ohne verwertbares Datum oder älter als max_age_days aussortieren."""
    if max_age_days is None:
        return rows
    today = today or datetime.now(TZ).date()
    cutoff = today - timedelta(days=max_age_days)
    out = []
    for r in rows:
        try:
            d = datetime.strptime(r.get("datum") or "", "%Y-%m-%d").date()
        except ValueError:
            continue
        if d >= cutoff:
            out.append(r)
    return out

def update_polls(d):
    try:
        db = json.loads(get(DAWUM, timeout=30))
    except Exception as e:
        print(f"! dawum nicht erreichbar ({e}); alte Umfragedaten bleiben stehen")
        return
    stand = db.get("Database", {}).get("Last_Update")
    for ebene in d.get("ebenen", []):
        rows = fdp_rows(db, ebene["parlament_regex"])
        rows = filter_by_age(rows, ebene.get("umfrage_max_alter_tage"))
        ebene["umfragen"] = {"stand": stand, "rows": rows}
        print(f"Umfragen gespeichert: {ebene['name']}: {len(rows)} Einzelumfrage(n).")

def set_trend(d, ebene_id, value, stand):
    ebene = next((e for e in d.get("ebenen", []) if e["id"] == ebene_id), None)
    if ebene is None:
        raise SystemExit(f"Unbekannte Ebene '{ebene_id}' – siehe data.json[\"ebenen\"][*][\"id\"]")
    t = ebene.setdefault("wahltrend", {"wert": None, "delta": None, "stand": None})
    old = t.get("wert")
    t["delta"] = round(value - old, 1) if isinstance(old, (int, float)) and t.get("stand") != stand else t.get("delta")
    t["wert"] = round(value, 1)
    t["stand"] = stand
    print(f"Wahltrend {ebene_id}: {t['wert']} % (Δ {t['delta']}), Stand {stand}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trend", nargs=2, action="append", metavar=("EBENE", "WERT"),
                     help="dawum-Wahltrend für Ebene setzen, z.B. --trend bund 4.4 --trend nrw 5.6 "
                          "(Ebene-IDs stehen in data.json[\"ebenen\"][*][\"id\"])")
    ap.add_argument("--stand", help="Stand des Wahltrends (YYYY-MM-DD), Standard heute")
    ap.add_argument("--nur-trend", action="store_true", help="nur Wahltrend setzen, keine Umfragen abrufen")
    a = ap.parse_args()
    d = load_data()
    stand = a.stand or datetime.now(TZ).date().isoformat()
    for ebene_id, value in (a.trend or []):
        set_trend(d, ebene_id, float(value), stand)
    if not a.nur_trend:
        update_polls(d)
    d["erstellt"] = datetime.now(TZ).isoformat(timespec="minutes")
    save_data(d)
    print("data.json geschrieben.")

if __name__ == "__main__":
    main()
