#!/usr/bin/env python3
"""
FDP-Monitor – Aktualisierungsskript (nur Python-Standardbibliothek).

Aufruf:  python3 update.py
Ergebnis:
  1. Neue URLs aus posts.txt werden per Instagram-oEmbed (tokenlos, nur öffentliche Posts)
     abgefragt, Vorschaubild nach thumbs/ geladen und in data.json eingetragen
     (Faktencheck-Status "ungeprüft", Text leer).
  2. Die neuesten FDP-Umfragen (Bund, NRW) werden von api.dawum.de gespeichert –
     als Fallback, falls der Browser die API nicht direkt erreichen kann.
  3. Optional: dawum-Wahltrend setzen (gewichteter Durchschnitt, steht nicht in der API):
       python3 update.py --trend-bund 4.4 --trend-nrw 5.6
     Δ zur Vorwoche wird aus dem bisher gespeicherten Wert berechnet; --stand YYYY-MM-DD
     überschreibt das Stand-Datum (Standard: heute).
  4. "erstellt" wird auf jetzt gesetzt.
Das Skript ändert vorhandene Posts und Faktenchecks NICHT.
"""
import argparse
import json, re, sys, os, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data.json")
INBOX = os.path.join(HERE, "posts.txt")
THUMBS = os.path.join(HERE, "thumbs")
OEMBED = "https://graph.facebook.com/v25.0/instagram_oembed"   # Version ggf. anpassen
DAWUM = "https://api.dawum.de/newest_surveys.json"
UA = "Mozilla/5.0 (fdp-monitor; github-pages)"
TZ = timezone(timedelta(hours=2))  # Europa/Berlin (Sommerzeit); nur für "erstellt"

def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def norm_url(u):
    """?igsh=… u. ä. entfernen, auf https://www.instagram.com/<typ>/<code>/ normalisieren."""
    m = re.search(r"instagram\.com/(p|reel|reels|tv)/([A-Za-z0-9_-]+)", u)
    if not m:
        return None
    typ = "reel" if m.group(1) == "reels" else m.group(1)
    return f"https://www.instagram.com/{typ}/{m.group(2)}/"

def post_id(u):
    return re.search(r"/(?:p|reel|tv)/([A-Za-z0-9_-]+)/", u).group(1)

def load_data():
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)

def save_data(d):
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")

def read_inbox():
    if not os.path.exists(INBOX):
        return []
    out = []
    with open(INBOX, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            n = norm_url(line)
            if n and n not in out:
                out.append(n)
            elif not n:
                print(f"  ! keine Post-URL erkannt, übersprungen: {line}")
    return out

def fetch_oembed(url):
    q = urllib.parse.urlencode({"url": url, "omitscript": "true", "maxwidth": 540})
    return json.loads(get(f"{OEMBED}?{q}"))

def save_thumb(pid, thumb_url):
    if not thumb_url:
        return None
    os.makedirs(THUMBS, exist_ok=True)
    path = os.path.join(THUMBS, f"{pid}.jpg")
    try:
        with open(path, "wb") as f:
            f.write(get(thumb_url))
        return f"thumbs/{pid}.jpg"
    except Exception as e:
        print(f"  ! Vorschaubild nicht ladbar ({e}); nutze Remote-URL")
        return thumb_url

def add_posts(d):
    known = {p["url"] for p in d.get("posts", [])}
    handles = {a["handle"].lower(): a for a in d.get("accounts", [])}
    new = 0
    for url in read_inbox():
        if url in known:
            continue
        print(f"→ {url}")
        try:
            o = fetch_oembed(url)
        except urllib.error.HTTPError as e:
            print(f"  ! oEmbed-Fehler {e.code} (privat, gelöscht oder Rate-Limit) – übersprungen")
            continue
        except Exception as e:
            print(f"  ! Fehler: {e} – übersprungen")
            continue
        author = (o.get("author_name") or "").lower()
        pid = post_id(url)
        entry = {
            "id": pid,
            "url": url,
            "handle": author if author in handles else author,
            "autor": o.get("author_name"),
            "hinzugefuegt": datetime.now(TZ).date().isoformat(),
            "datum": None,                      # Veröffentlichungsdatum bei Bedarf manuell eintragen
            "caption": (o.get("title") or "")[:300],
            "thumbnail": save_thumb(pid, o.get("thumbnail_url")),
            "embed_html": o.get("html"),
            "faktencheck": {"status": "ungeprüft", "text": "", "quellen": [], "geprueft_am": None},
        }
        if author not in handles:
            print(f"  ! Account '{author}' steht nicht in accounts – Post wird trotzdem aufgenommen")
        d.setdefault("posts", []).append(entry)
        known.add(url)
        new += 1
    print(f"{new} neue(r) Post(s) aufgenommen.")

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

def update_polls(d):
    try:
        db = json.loads(get(DAWUM, timeout=30))
    except Exception as e:
        print(f"! dawum nicht erreichbar ({e}); alte Umfragedaten bleiben stehen")
        return
    d["umfragen"] = {
        "stand": db.get("Database", {}).get("Last_Update"),
        "bundestag": fdp_rows(db, r"bundestag"),
        "nrw": fdp_rows(db, r"nordrhein"),
    }
    print(f"Umfragen gespeichert: {len(d['umfragen']['bundestag'])} Bund, {len(d['umfragen']['nrw'])} NRW.")

def set_trend(d, key, value, stand):
    t = d.setdefault("wahltrend", {}).setdefault(key, {"wert": None, "delta": None, "stand": None})
    old = t.get("wert")
    t["delta"] = round(value - old, 1) if isinstance(old, (int, float)) and t.get("stand") != stand else t.get("delta")
    t["wert"] = round(value, 1)
    t["stand"] = stand
    print(f"Wahltrend {key}: {t['wert']} % (Δ {t['delta']}), Stand {stand}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trend-bund", type=float, help="dawum-Wahltrend Bundestag in %%")
    ap.add_argument("--trend-nrw", type=float, help="dawum-Wahltrend Landtag NRW in %%")
    ap.add_argument("--stand", help="Stand des Wahltrends (YYYY-MM-DD), Standard heute")
    ap.add_argument("--nur-trend", action="store_true", help="nur Wahltrend setzen, keine Posts/Umfragen abrufen")
    a = ap.parse_args()
    d = load_data()
    stand = a.stand or datetime.now(TZ).date().isoformat()
    if a.trend_bund is not None: set_trend(d, "bundestag", a.trend_bund, stand)
    if a.trend_nrw is not None: set_trend(d, "nrw", a.trend_nrw, stand)
    if not a.nur_trend:
        add_posts(d)
        update_polls(d)
    d["erstellt"] = datetime.now(TZ).isoformat(timespec="minutes")
    save_data(d)
    print("data.json geschrieben.")

if __name__ == "__main__":
    main()
