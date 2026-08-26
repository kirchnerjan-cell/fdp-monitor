# Routine-Prompt: FDP-Monitor aktualisieren

Diesen Text als Zusatzschritt an die bestehende wöchentliche Umfrage-Routine in Claude Code anhängen (oder als eigene Routine anlegen). Repo: das GitHub-Repo mit `index.html`, `data.json`, `posts.txt`, `update.py`.

---

## Schritt: Website „FDP-Monitor" aktualisieren

1. Nimm den gewichteten dawum-Wahltrend der FDP, den du in den vorherigen Schritten bereits ermittelt hast (Bundestag von https://dawum.de/Bundestag/, Landtag NRW von https://dawum.de/Nordrhein-Westfalen/; NRW nur, wenn dort ein Wahltrend ausgewiesen ist). Führe im Repo-Root aus:
   `python3 update.py --trend-bund <Wert> --trend-nrw <Wert>` (Dezimalpunkt, z. B. `4.4`; `--trend-nrw` weglassen, wenn kein NRW-Trend vorliegt).
   Das Skript berechnet Δ zur Vorwoche selbst, trägt neue URLs aus `posts.txt` in `data.json` ein (Vorschaubild, Embed-Code) und speichert die Einzelumfragen als Fallback. Gib die Ausgabe des Skripts wieder.

2. **Nur wenn in `data.json` `"faktencheck_aktiv": true` steht** (sonst Schritt überspringen): Für jeden Post in `data.json`, dessen `faktencheck.status` gleich `ungeprüft` ist und dessen `faktencheck.text` leer ist:
   - Öffne die Post-URL (oder nutze `caption`) und fasse die zentrale überprüfbare Aussage in einem Satz zusammen. Enthält der Post keine überprüfbare Tatsachenbehauptung, setze `status: "meinung"` und schreibe in `text`, warum (z. B. „Wertung ohne Tatsachenkern").
   - Recherchiere die Aussage mit Web-Suche. Bevorzuge Primärquellen: Statistisches Bundesamt, Bundestag/Drucksachen, Ministerien, Bundesbank, Eurostat, dawum.de, Gesetzestexte. Nachrichtenagenturen (dpa, Reuters) als zweite Wahl. Keine Parteiquellen als Beleg für Parteibehauptungen.
   - Setze `status` auf genau einen Wert: `korrekt` · `teils korrekt` · `irreführend` · `falsch` · `meinung`. Lässt sich die Aussage nicht klären, bleibt `ungeprüft` und `text` erklärt, was fehlt.
   - Schreibe `text`: maximal 4 Sätze, nüchtern, erst die Aussage, dann der Befund, dann die Einordnung. Keine Wertung der Partei, nur der Aussage.
   - Trage in `quellen` 1–3 Einträge `{ "titel": "...", "url": "..." }` ein, die du tatsächlich aufgerufen hast.
   - Setze `geprueft_am` auf das heutige Datum (YYYY-MM-DD).
   - Wenn du das Veröffentlichungsdatum des Posts erkennen kannst, trage es in `datum` (YYYY-MM-DD) ein.

3. Ändere nichts an Posts, die bereits einen `status` ungleich `ungeprüft` haben – die sind redaktionell freigegeben.

4. Prüfe, dass `data.json` gültiges JSON ist (`python3 -c "import json;json.load(open('data.json'))"`).

5. Committe und pushe: `git add data.json posts.txt thumbs && git commit -m "Monitor-Update KW <Kalenderwoche>" && git push`.

6. Melde am Ende: Wahltrend-Werte mit Δ, Anzahl neuer Posts, ob dawum live erreichbar war – und, falls Faktencheck aktiv, Anzahl neuer Faktenchecks mit Status-Verteilung.

---

## Anmerkungen für Jan

- Faktencheck ist über `"faktencheck_aktiv": false` in `data.json` derzeit ausgeschaltet: Karten verlinken direkt auf Instagram, kein Badge, kein Hinweis-Abschnitt. Einschalten = Wert auf `true` setzen; die Datenstruktur bleibt unverändert, `update.py` legt die leeren Faktencheck-Felder weiterhin an.

- Faktenchecks, die die Routine schreibt, sind Entwürfe. Freigabe = Status stehen lassen oder ändern; jede Änderung im JSON gilt als redaktionelle Entscheidung und wird von der Routine nicht mehr angefasst.
- Wenn ein Faktencheck neu geschrieben werden soll: `status` auf `ungeprüft` und `text` auf `""` setzen, dann läuft die Routine erneut drüber.
- Erwartete Laufzeit pro Post: 1–3 Minuten (Recherche). Bei mehr als ~10 neuen Posts pro Woche die Routine öfter laufen lassen.
