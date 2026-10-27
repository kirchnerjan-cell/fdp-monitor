# Routine-Prompt: Kubicki-Monitor aktualisieren

Diesen Text als eigene wöchentliche Routine in Claude Code anlegen (oder als
Zusatzschritt an die bestehende FDP-Monitor-Routine anhängen). Repo: das GitHub-Repo
mit `kubicki.html`, `kubicki-data.json`, `kubicki-utils.js`, `kubicki_stats.py`.

Es gibt für Cicero-Beiträge keine öffentliche API und für Interview-Auftritte kein
Sender-übergreifendes Archiv – beides läuft daher über Websuche, nicht über ein
Abruf-Skript wie `update.py` beim FDP-Monitor.

---

## Schritt: Kubicki-Monitor aktualisieren

1. **Cicero-Beiträge.** Lies `kubicki-data.json["beitraege"]` (bereits erfasste URLs).
   Durchsuche per Websuche `site:cicero.de Wolfgang Kubicki` nach Texten, die dort noch
   nicht stehen. Für jeden neuen Treffer: Titel, Veröffentlichungsdatum (YYYY-MM-DD) und
   URL ermitteln – bei unklarem Datum die Artikelseite direkt abrufen, falls erreichbar.
   Neue Einträge als `{"titel": "...", "datum": "...", "url": "..."}` an `beitraege`
   anhängen. Keine Duplikate (Abgleich über `url`).

2. **Interview-Vorschläge.** Für jeden Sender in `kubicki-data.json["quellen"]["sender"]`
   (Standard: WELT TV, ARD, ZDF, Phoenix, Deutschlandfunk, taz) nach aktuellen
   Kubicki-Interviews der letzten 7 Tage suchen. Welche Suchform funktioniert, ist pro
   Sender sehr unterschiedlich (Stand Okt. 2026, per Websuche geprüft):
   - **`site:`-Suche funktioniert zuverlässig:** cicero.de, taz.de, zdf.de. Also z. B.
     `site:zdf.de Kubicki` oder `site:taz.de Kubicki Interview`.
   - **`site:`-Suche liefert nichts Brauchbares** (Paywall/fehlende Indexierung, leer
     oder nur fachfremde Treffer): welt.de, spiegel.de, phoenix.de, deutschlandfunk.de,
     tagesschau.de. Hier stattdessen mit Klartext-Fragen suchen (z. B. `Wolfgang Kubicki
     Interview WELT TV <Monat Jahr>`) – liefert erfahrungsgemäß vor allem ältere
     YouTube-Treffer und kein verlässliches Datum für die laufende Woche. Lieber keinen
     Treffer eintragen als ein geratenes Datum.
   - Direkter Abruf (`WebFetch`) von cicero.de, welt.de, spiegel.de, taz.de scheitert in
     der Sandbox-Umgebung an der Netzwerk-Sperre – nur die Websuche selbst funktioniert.
   Jeden neuen, mit Titel **und** Datum **und** URL eindeutig belegten Treffer als
   **Vorschlag** anhängen:
   ```json
   {"sender": "taz", "titel": "...", "datum": "YYYY-MM-DD", "url": "...", "status": "vorschlag"}
   ```
   Wichtig: **immer** `"status": "vorschlag"` setzen, nie `"bestaetigt"` – das entscheidet
   ausschließlich Jan von Hand (siehe unten). Keine Duplikate (Abgleich über `url`,
   unabhängig vom Status). Sender außerhalb der Liste ebenfalls aufnehmen, wenn ein
   Treffer eindeutig ist – das Feld ist kein hartes Limit, nur eine Startliste. Lässt
   sich für einen Sender in einer Woche nichts Verlässliches finden, einfach weglassen
   statt zu raten – das ist der Normalfall, kein Fehler.

3. Prüfe, dass `kubicki-data.json` gültiges JSON ist:
   `python3 -c "import json;json.load(open('kubicki-data.json'))"`.

4. Führe `python3 kubicki_stats.py` aus und gib die Ausgabe wieder (Wochen-Report,
   letzte 8 Kalenderwochen, inkl. Hinweis auf offene Vorschläge).

5. Nur wenn sich `beitraege` oder `interviews` inhaltlich geändert haben: `"erstellt"`
   auf jetzt setzen (ISO-Format wie in `data.json`).

6. Prüfe zuerst, ob es überhaupt etwas zu committen gibt:
   `git status --porcelain kubicki-data.json`.
   - Eine Zeile Ausgabe: `git add kubicki-data.json && git commit -m "Kubicki-Monitor-Update KW <Kalenderwoche>" && git push`.
   - Leere Ausgabe: nichts geändert, **kein** Commit, **kein** Push – kein Fehler.

7. Melde am Ende: Anzahl neuer Cicero-Beiträge (mit Titeln), Anzahl neuer
   Interview-Vorschläge je Sender, Gesamtzahl offener (unbestätigter) Vorschläge, und
   ob committet wurde oder nichts zu ändern war.

---

## Anmerkungen für Jan

- **Vorschläge bestätigen:** Auf `kubicki.html` unter "Unbestätigte Vorschläge"
  prüfen. Stimmt ein Eintrag, in `kubicki-data.json` bei diesem Interview `"status"`
  von `"vorschlag"` auf `"bestaetigt"` setzen – erst dann zählt er in den
  Wochen-Balken mit. Stimmt er nicht, den Eintrag löschen. Beides direkt im Browser
  über GitHub oder lokal, dann committen.
- Cicero-Beiträge werden ohne Vorschlag-Status direkt übernommen – die Themenseite
  `cicero.de/themen/wolfgang-kubicki` ist eindeutig genug, dass hier keine manuelle
  Prüfung nötig ist.
- Sender-Liste in `kubicki-data.json["quellen"]["sender"]` erweitern, wenn Kubicki
  regelmäßig bei einem weiteren Sender auftritt – die Routine sucht dann automatisch
  auch dort. Kein Codeänderung nötig.
