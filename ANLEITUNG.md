# FDP-Monitor – Einrichtung auf GitHub Pages

Ziel: Öffentliche Website mit FDP-Umfragewerten für Bundestag und Landtagswahlen (dawum-Wahltrend als Leitzahl, Einzelumfragen live von dawum.de). Aktualisierung über `update.py` + Claude-Code-Routine.

Die Instagram-Anbindung (Posts, Faktencheck) wurde entfernt und kann bei Bedarf später wieder ergänzt werden – die Git-Historie enthält den vollständigen alten Code.

## Dateien im Paket

| Datei | Zweck | Anfassen? |
|---|---|---|
| `index.html` | Die Website (eine Datei, kein Framework) | nur bei Design-Änderungen |
| `monitor-utils.js` | Reine Hilfsfunktionen der Website (getestet mit Vitest) | nur bei Logik-Änderungen |
| `data.json` | Ebenen (Bund + Länder) mit Wahltermin, Wahltrend, Umfrage-Fallback | Wahltermine/Wahlergebnisse redaktionell pflegen |
| `update.py` | Holt Umfragen von dawum.de, schreibt `data.json` | nein |
| `ROUTINE-PROMPT.md` | Zusatzschritt für die Claude-Code-Routine | einmal einbauen |

## Ebenen in `data.json`

Jeder Eintrag in `data.json["ebenen"]` beschreibt eine Wahl:

```json
{
  "id": "sachsen-anhalt",
  "name": "Landtagswahl Sachsen-Anhalt",
  "kurz": "ST",
  "css": "land",
  "parlament_regex": "sachsen.anhalt",
  "dawum_slug": "Sachsen-Anhalt",
  "wahltermin": "2026-06-07",
  "wahlergebnis": null,
  "wahltrend": { "wert": null, "delta": null, "stand": null },
  "umfragen": { "stand": null, "rows": [] }
}
```

- `id`: eindeutiger Schlüssel, wird auch als `--trend <id> <wert>`-Argument benutzt.
- `parlament_regex`: matcht gegen `"<Shortcut> <Name>"` aus der dawum-API (Groß-/Kleinschreibung egal).
- `dawum_slug`: Pfadsegment für den Live-Link auf dawum.de (z. B. `https://dawum.de/Sachsen-Anhalt/`).
- `wahltermin`: Datum der nächsten Wahl (YYYY-MM-DD) – bestimmt die Sortierung auf der Seite. Bei der Bundestagswahl `null` lassen, sie steht immer zuerst.
- `wahlergebnis`: `null`, solange die Wahl nicht stattgefunden hat. Sobald ein amtliches Ergebnis feststeht, `{"fdp": <Prozent>, "datum": "YYYY-MM-DD"}` eintragen – die Seite zeigt es dann als zusätzlichen, schraffierten Balken oberhalb der Umfragen.
- Neue Ebene hinzufügen: Objekt mit diesen Feldern anhängen; `update.py` befüllt `umfragen` beim nächsten Lauf automatisch.

**Wichtig zu den aktuell hinterlegten Wahlterminen (Sachsen-Anhalt, Mecklenburg-Vorpommern, Berlin, NRW):** Diese wurden ohne Zugriff auf die dawum-API/offizielle Quellen eingetragen und sollten vor Veröffentlichung gegen die Landeswahlleiter-Webseiten geprüft werden.

## Reihenfolge auf der Seite

Bundesebene steht immer zuerst. Die Länder folgen danach, sortiert nach `wahltermin` (nächster Termin zuerst). Das übernimmt `sortEbenen()` in `monitor-utils.js`.

---

## Einrichtung (ca. 15 Min, Mac oder iPhone im Browser)

1. github.com → oben rechts **+** → **New repository**
   - Name: `fdp-monitor` · Sichtbarkeit: **Public** · Häkchen bei **Add a README** · **Create repository**
2. Im Repo: **Add file** → **Upload files** → alle Dateien aus dem Paket ziehen → **Commit changes**
3. **Settings** (Reiter oben) → linke Spalte **Pages**
   - Source: **Deploy from a branch** · Branch: **main** · Ordner: **/ (root)** → **Save**
4. 1–2 Minuten warten, Seite neu laden: oben erscheint die Adresse `https://<dein-name>.github.io/fdp-monitor/`

🎯 **Aufgabe:** Adresse im Safari öffnen.
**Fertig wenn:** Kopfzeile „FDP-Monitor" erscheint, unter „Umfragewerte" stehen mehrere Panels (Bund zuerst) mit Balken und Institutsnamen, Notiz „Live von dawum.de".

Falls die Balken fehlen und „Keine Einzelumfragen gefunden" steht: dawum blockiert den Direktabruf aus dem Browser, oder für diese Ebene liegen noch keine Umfragen vor. `update.py` (siehe unten) speichert die Werte als Fallback in `data.json`.

## Wahltrend aktualisieren

Wert von der jeweiligen dawum.de-Seite ablesen (Dezimalpunkt) und für die betroffene Ebene setzen:

```
python3 update.py --nur-trend --trend bund 4.4 --trend nrw 5.6 --trend sachsen-anhalt 3.9
```

Beim ersten Mal je Ebene ohne Δ; ab dem zweiten Lauf mit anderem `--stand`-Datum berechnet das Skript Δ zur Vorwoche selbst. Ohne `--nur-trend` ruft `update.py` zusätzlich die aktuellen Einzelumfragen für alle Ebenen aus `data.json["ebenen"]` ab:

```
python3 update.py
```

Danach hochladen:
```
git add -A
git commit -m "Umfragen aktualisiert"
git push
```

## Amtliches Wahlergebnis eintragen

Sobald eine Wahl stattgefunden hat: in `data.json` bei der betroffenen Ebene `wahlergebnis` setzen (siehe oben), committen und pushen. Die Seite zeigt es automatisch als zusätzlichen Balken.

---

## Routine in Claude Code erweitern (ca. 10 Min)

1. Bestehende Umfrage-Routine öffnen (Claude Web-UI → Code → Routines).
2. Sicherstellen, dass die Routine auf das Repo `fdp-monitor` zugreift.
3. Inhalt von `ROUTINE-PROMPT.md` ab „## Schritt" als weiteren Schritt an den Routine-Prompt anhängen.
4. Routine einmal manuell starten.

🎯 **Aufgabe:** Manuellen Lauf abwarten.
**Fertig wenn:** Die Routine meldet Wahltrend-Werte mit Δ für alle Ebenen, im Repo gibt es einen Commit „Monitor-Update KW …", und auf der Website stehen die neuen Werte mit aktuellem Stand-Datum.

---

## Wöchentlicher Ablauf

1. Routine läuft (Umfragen + Monitor-Update): setzt Wahltrend mit Δ für alle Ebenen, pusht.
2. Website prüfen; Korrekturen direkt in `data.json` über GitHub im Browser.

## Bekannte Grenzen

- Der dawum-Wahltrend steht nicht in der API, sondern nur auf der dawum-Website. Er wird deshalb von der Routine (oder von dir per `--trend <id> <wert>`) in `data.json` geschrieben; die Seite zeigt zusätzlich den einfachen Ø der neuesten Umfrage je Institut, damit ein Live-Wert auch ohne Routine sichtbar ist.
- Amtliche Wahlergebnisse liefert dawum nicht automatisch – `wahlergebnis` muss redaktionell eingetragen werden (siehe oben).
