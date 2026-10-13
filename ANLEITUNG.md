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
  "wahltermin": "2026-09-06",
  "umfrage_max_alter_tage": 180,
  "wahlergebnis": null,
  "wahltrend": { "wert": null, "delta": null, "stand": null },
  "umfragen": { "stand": null, "rows": [] }
}
```

- `id`: eindeutiger Schlüssel, wird auch als `--trend <id> <wert>`-Argument benutzt. Bleibt stabil, auch wenn sich `kurz` ändert (z. B. Ebene `nrw` mit Kürzel `NW`).
- `kurz`: Kürzel auf dem Badge oben rechts im Panel. Konvention: das **ISO-3166-2-Kürzel** des Bundeslands ohne `DE-`-Präfix, also `BW BY BE BB HB HH HE MV NI NW RP SL SN ST SH TH`. Ausnahme: die Bundesebene trägt `Bund`, da ISO 3166-2 dafür kein Kürzel vorsieht.
- `parlament_regex`: matcht gegen `"<Shortcut> <Name>"` aus der dawum-API (Groß-/Kleinschreibung egal).
- `dawum_slug`: Pfadsegment für den Live-Link auf dawum.de (z. B. `https://dawum.de/Sachsen-Anhalt/`).
- `wahltermin`: Datum der nächsten Wahl (YYYY-MM-DD) – bestimmt die Sortierung auf der Seite. Bei der Bundestagswahl `null` lassen, sie steht immer zuerst.
- `umfrage_max_alter_tage`: Einzelumfragen, deren `datum` älter ist, werden weder von `update.py` gespeichert noch auf der Seite angezeigt (Umfragen ohne Datum ebenfalls). `null`/Feld weglassen = kein Limit. Aktuell: Bund 60 Tage, alle Länder 180 Tage.
- `wahltrend_max_alter_tage`: Ab diesem Alter gilt der gespeicherte `wahltrend` als veraltet und wird nicht mehr als Leitzahl benutzt; `update.py` verwirft ihn dann. Die Seite zeigt stattdessen den Ø der neuesten Umfragen je Institut, der bei jedem Aufruf neu von dawum kommt. `null`/Feld weglassen = der Trend altert nie (nicht empfohlen). Überall 21 Tage: dawum bildet seinen Wahltrend nur aus Umfragen, deren letzter Befragungstag höchstens 20 Tage vor der neuesten liegt – ein älterer Wert kann also auf keiner Ebene ein aktuell ausgewiesener sein. Gemessen wird gegen `wahltrend.stand`, und das muss dawums eigenes Trend-Datum sein (darum ist `--stand` bei `--trend` Pflicht), nicht das Abrufdatum.
  *Warum nötig:* dawum weist für eine Ebene keinen Wahltrend mehr aus, sobald dort länger keine Umfragen erscheinen. Die Routine findet dann keinen Wert und überspringt die Ebene – ohne Alterung bliebe der letzte Wert dauerhaft als große Zahl stehen. Genau das war bei NRW passiert: Leitzahl 6,2 % vom 26.08.2026, während die Einzelumfragen bei 4,0 % lagen.
- `wahlergebnis`: `null`, solange die Wahl nicht stattgefunden hat. Sobald ein amtliches Ergebnis feststeht, `{"fdp": <Prozent>, "datum": "YYYY-MM-DD"}` eintragen – maßgeblich ist der **Zweitstimmen**-Anteil. Die Seite zeigt es dann als zusätzlichen, schraffierten Balken oberhalb der Umfragen (der Altersfilter gilt nur für Einzelumfragen, nicht für `wahlergebnis`).
- `wahlergebnis.vorlaeufig`: optional, nur `true` setzen, solange erst das **vorläufige** amtliche Endergebnis vorliegt und der Landeswahlausschuss das endgültige noch nicht festgestellt hat. Die Routine prüft solche Ebenen weiter und entfernt das Feld, sobald sie den endgültigen Wert eingetragen hat. Fehlt das Feld, gilt das Ergebnis als endgültig und wird nicht mehr geprüft.
- `datenhinweis`: optionaler Satz, der erklärt, **warum** eine Ebene keine Werte hat – etwa weil die Institute die FDP dort nicht separat ausweisen. Ist er gesetzt und liegen keine Werte vor, zeigt die Kachel diesen Satz, der Status heißt „nicht ausgewiesen" statt „keine Daten", und der Wahltrend-Hinweis entfällt (ohne ausgewiesene Werte kann dawum keinen Trend bilden). Sobald wieder Werte kommen, verschwindet der Hinweis von selbst – er muss nicht entfernt werden, schadet aber auch nicht. Weglassen, wenn schlicht noch keine Umfrage erschienen ist; dann steht dort wie bisher „Noch keine Umfragen bei dawum."
- **Abgeschlossene Wahl:** Sobald ein `wahlergebnis` ohne `vorlaeufig` steht, gilt die Wahl als abgeschlossen. `update.py` verwirft dann einmalig die gespeicherten Einzelumfragen dieser Ebene (das amtliche Ergebnis sagt dasselbe genauer) und überspringt sie künftig; auch die Seite ruft für sie nichts mehr ab. Sind alle Ebenen abgeschlossen, unterbleibt der dawum-Abruf ganz. **Wieder aufnehmen** (z. B. für die übernächste Wahl desselben Landes): `wahltermin` auf den neuen Termin setzen und `wahlergebnis` auf `null` – ab dem nächsten Lauf sammelt die Ebene wieder Umfragen.
- **Neue Ebene hinzufügen:** einen bestehenden Landtag-Block kopieren und `id`, `name`, `kurz`, `parlament_regex`, `dawum_slug`, `wahltermin` anpassen (`wahlergebnis`/`wahltrend`/`umfragen` auf die leeren Startwerte wie oben zurücksetzen). Danach greifen Routine und `update.py` automatisch mit – keine Codeänderung nötig.
- **Ebene entfernen:** den ganzen Block aus `data.json["ebenen"]` löschen. Auch dafür ist keine Codeänderung nötig, da weder `update.py` noch die Seite eine feste Liste von Ebenen-IDs kennen (einzige Ausnahme: `"bund"` steht in `sortEbenen()` immer an erster Stelle).

### Hinterlegte Wahltermine

| Ebene | Wahltermin | Quelle |
|---|---|---|
| Sachsen-Anhalt | 06.09.2026 | gelaufen; endgültiges Ergebnis 22.09.2026 festgestellt, eingetragen (FDP 2,6 %) |
| Mecklenburg-Vorpommern | 20.09.2026 | gelaufen; endgültiges Ergebnis 30.09.2026 festgestellt, eingetragen (FDP 1,0 %) |
| Berlin | 20.09.2026 | gelaufen; vorläufiges Ergebnis eingetragen (FDP 2,5 %), endgültige Feststellung 12.10.2026 |
| Saarland | 18.04.2027 | Ministerrat, Wahlankündigung des Landes |
| Schleswig-Holstein | 18.04.2027 | Innenministerium Schleswig-Holstein |
| NRW | 25.04.2027 | ungeprüft – bitte gegen den Landeswahlleiter abgleichen |
| Bremen | 30.05.2027 | Senatsbeschluss zur Bürgerschaftswahl |
| Niedersachsen | 26.09.2027 | Kabinettsbeschluss, Pressemitteilung der Staatskanzlei |

Saarland und Schleswig-Holstein wählen am selben Tag. Bei gleichem `wahltermin` entscheidet die Reihenfolge in `data.json` über die Anzeige – dort steht Saarland vor Schleswig-Holstein.

## Reihenfolge auf der Seite

Die Seite hat drei Blöcke: oben die **Bundesebene** als große Karte, darunter die **anstehenden** Wahlen als Kacheln, am Ende die **gelaufenen** Wahlen als Tabelle. `gruppiereEbenen()` in `monitor-utils.js` teilt die Ebenen danach auf; eine Ebene gilt als gelaufen, sobald sie ein `wahlergebnis` trägt oder ihr `wahltermin` vorbei ist.

Bundesebene steht immer zuerst. Danach kommen die **anstehenden** Wahlen, nächster Termin zuerst. Dahinter die bereits **gelaufenen** Wahlen, zuletzt gewählte zuerst — so rutschen abgeschlossene Wahlen nach unten, statt die anstehenden zu verdrängen. Ganz am Ende stünden Ebenen ohne `wahltermin`. Der Wahltag selbst zählt noch als anstehend. Das übernimmt `sortEbenen()` in `monitor-utils.js`.

Sobald eine Ebene ein `wahlergebnis` trägt, ist dieses die **Leitzahl** des Panels – nicht mehr der Wahltrend und nicht der Mittelwert der Umfragen. Die Wahl ist entschieden, das Ergebnis ist die Tatsache. Solange das Ergebnis noch `vorlaeufig` ist, laufen die Umfragen weiter; in den Ø gehen dann nur die ein, die **nach** dem Wahltag erhoben wurden (sie betreffen die nächste Wahl). Mit dem endgültigen Ergebnis endet die Abfrage für diese Ebene ganz. Ein noch vorläufiges Ergebnis wird in der Leitzahl als „(vorläufig)" gekennzeichnet.

Eine gelaufene Wahl bleibt also sichtbar — mit ihrem `wahlergebnis` als schraffiertem Balken. Wenn sie ganz verschwinden soll, den Block aus `data.json["ebenen"]` löschen (siehe oben).

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

Wert **und Trend-Datum** von der jeweiligen dawum.de-Seite ablesen (Dezimalpunkt) und für die betroffene Ebene setzen:

```
python3 update.py --nur-trend --stand 2026-10-11 --trend bund 4.4 --trend nrw 5.6
```

`--stand` ist das Datum, das dawum am Wahltrend selbst ausweist, und ist zusammen mit `--trend` Pflicht – das Skript bricht sonst ab. Trägt man dort das Abrufdatum ein, wirkt ein alter Trend aktueller als er ist und altert zu spät aus. Weisen zwei Ebenen unterschiedliche Trend-Daten aus, das Skript je Datum einmal aufrufen.

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

## App-Icon und Homescreen

`index.html` verweist auf `icons/` und `manifest.webmanifest`; damit zeigt „Zum Home-Bildschirm" in Safari und Chrome das eigene Icon statt eines Screenshots. Motiv ist Variante A aus dem Design-Entwurf: drei dunkle Balken unter einer gestrichelten Hürdenlinie auf Gelb.

| Datei | wofür |
|---|---|
| `icons/icon.svg` | Logo im Seitenkopf (40 px) |
| `icons/favicon.svg` / `icons/favicon.ico` | Browser-Tab (SVG bevorzugt, ICO als Rückfall) |
| `icons/apple-touch-icon.png` | iOS-Homescreen, 180 px, randlos (iOS rundet selbst ab) |
| `icons/icon-192.png`, `icons/icon-512.png` | im Manifest, für Android und PWA-Installation |

Die PNG-Dateien werden **ohne Alphakanal** geschrieben: Apple ignoriert Transparenz und stellt sie je nach iOS-Fassung schwarz dar. Das Motiv ist ohnehin deckend.

**Icon erscheint nicht auf dem Homescreen?** Das ist fast immer der iOS-Cache, nicht die Seite — iOS merkt sich je Adresse sehr hartnäckig, dass es dort kein Icon gab. In dieser Reihenfolge löst es sich: das vorhandene Symbol vom Homescreen löschen, Einstellungen → Safari → Verlauf und Websitedaten löschen, Safari komplett schließen (App-Umschalter, hochwischen), Seite neu öffnen und erst dann wieder „Zum Home-Bildschirm" wählen. Genau so ist es beim ersten Mal auch aufgetreten und gelöst worden.

Soll das Icon geändert werden: `icons/icon.svg` anpassen, die gleiche Geometrie in `icons/make-icons.py` nachziehen und das Skript einmal laufen lassen (`pip install pillow` vorausgesetzt). Es erzeugt die Rasterdateien neu. Unter 32 px lässt es die Hürdenlinie weg und macht die Balken breiter, sonst verschwimmt beides.

---

## Wenn die Seite leer bleibt

`index.html` und `monitor-utils.js` gehören zusammen: die Seite ruft Funktionen auf, die in der Skriptdatei stehen. Liefert ein Browser- oder CDN-Cache nach einem Deploy noch die **alte** Skriptdatei zur neuen Seite, fehlen diese Funktionen — früher blieb die Seite dann vollständig leer, ohne jeden Hinweis.

Dagegen sind drei Dinge eingebaut:

1. Die Seite lädt `monitor-utils.js?v=<Nummer>`. **Diese Nummer bei jeder Änderung an `monitor-utils.js` hochzählen** — dann kann kein Cache die beiden Fassungen vermischen.
2. Fehlt trotzdem eine Funktion, lädt die Seite die Skriptdatei einmal mit einem Zeitstempel frisch nach und arbeitet normal weiter.
3. Hilft auch das nicht, erscheint eine Meldung mit der Bitte, neu zu laden — nie eine weiße Seite.

Zeigt die Seite dennoch nichts: in der Browser-Konsole nachsehen und einmal hart neu laden (Mac: Cmd+Shift+R, iOS: Einstellungen → Safari → Verlauf und Websitedaten löschen).

---

## Bekannte Grenzen

- Der dawum-Wahltrend steht nicht in der API, sondern nur auf der dawum-Website. Er wird deshalb von der Routine (oder von dir per `--trend <id> <wert>`) in `data.json` geschrieben; die Seite zeigt zusätzlich den einfachen Ø der neuesten Umfrage je Institut, damit ein Live-Wert auch ohne Routine sichtbar ist.
- Für das **Saarland** liegen keine FDP-Werte vor: die Institute weisen die FDP in den Saarland-Umfragen nicht mehr einzeln aus, sondern führen sie unter „Sonstige". Das steht als `datenhinweis` in `data.json` und wird auf der Kachel angezeigt – kein Konfigurationsfehler, `parlament_regex` und `dawum_slug` sind geprüft. Sobald wieder ein eigener FDP-Wert erscheint, füllt sich die Ebene automatisch.
- Amtliche Wahlergebnisse liefert dawum nicht automatisch – `wahlergebnis` muss redaktionell eingetragen werden (siehe oben).
- Der Altersfilter (`umfrage_max_alter_tage`) wirkt sowohl beim Live-Abruf im Browser (`monitor-utils.js`) als auch beim Fallback-Speichern in `update.py` – bereits in `data.json` gespeicherte ältere Umfragen bleiben als Rohdaten stehen, werden aber erst beim nächsten `update.py`-Lauf herausgefiltert bzw. sofort beim Anzeigen ausgeblendet.
