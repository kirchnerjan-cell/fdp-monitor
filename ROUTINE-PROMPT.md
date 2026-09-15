# Routine-Prompt: FDP-Monitor aktualisieren

Diesen Text als Zusatzschritt an die bestehende wöchentliche Umfrage-Routine in Claude Code anhängen (oder als eigene Routine anlegen). Repo: das GitHub-Repo mit `index.html`, `data.json`, `update.py`.

---

## Schritt: Website „FDP-Monitor" aktualisieren

1. Lies `data.json["ebenen"]` und ermittle für jede Ebene mit einem `dawum_slug` den gewichteten dawum-Wahltrend der FDP von `https://dawum.de/<dawum_slug>/` (z. B. `https://dawum.de/Bundestag/`, `https://dawum.de/Sachsen-Anhalt/`). Überspringe eine Ebene, wenn dort kein Wahltrend ausgewiesen ist.

2. Führe im Repo-Root aus, mit einem `--trend <id> <Wert>` je Ebene, für die ein Wert vorliegt (Dezimalpunkt, z. B. `4.4`; `id` ist das Feld `"id"` der jeweiligen Ebene):
   ```
   python3 update.py --trend bund <Wert> --trend nrw <Wert> --trend sachsen-anhalt <Wert> --trend mecklenburg-vorpommern <Wert> --trend berlin <Wert>
   ```
   Das Skript berechnet Δ zur Vorwoche selbst und speichert die Einzelumfragen aller Ebenen als Fallback. Gib die Ausgabe des Skripts wieder. Meldet es „Keine inhaltlichen Änderungen", lässt es `data.json` bewusst unangetastet – das ist kein Fehler.

3. Für jede Ebene, deren `wahltermin` in der Vergangenheit liegt und deren `wahlergebnis` noch `null` ist: prüfe per Web-Suche (Landeswahlleiter/Bundeswahlleiter, dpa/Reuters als zweite Wahl), ob ein amtliches Endergebnis für die FDP vorliegt. Falls ja, trage `{"fdp": <Prozent>, "datum": "<Wahltermin>"}` ein. Falls unklar, `wahlergebnis` unverändert lassen und das in der Abschlussmeldung erwähnen.

4. Prüfe, dass `data.json` gültiges JSON ist (`python3 -c "import json;json.load(open('data.json'))"`).

5. Prüfe zuerst, ob es überhaupt etwas zu committen gibt: `git status --porcelain data.json`.
   - Gibt das eine Zeile aus: `git add data.json && git commit -m "Monitor-Update KW <Kalenderwoche>" && git push`.
   - Ist die Ausgabe leer, hat sich nichts geändert. Dann **kein** Commit und **kein** Push – das ist der Normalfall bei einem Lauf ohne neue Umfragen und kein Fehler.

6. Melde am Ende: Wahltrend-Werte mit Δ je Ebene, ob dawum live erreichbar war, ob ein neues Wahlergebnis eingetragen wurde, und ob committet wurde oder es nichts zu ändern gab.

---

## Anmerkungen für Jan

- Die Instagram-Anbindung (Posts, Faktencheck) wurde entfernt und kann bei Bedarf später wieder ergänzt werden – die Git-Historie enthält den vollständigen alten Code.
- Neue Ebene (z. B. weiteres Bundesland) hinzufügen: Eintrag in `data.json["ebenen"]` ergänzen (siehe ANLEITUNG.md), danach greift diese Routine automatisch mit.
- Die aktuell hinterlegten Wahltermine für Sachsen-Anhalt, Mecklenburg-Vorpommern und Berlin sind unverifizierte Platzhalter – bitte einmal gegen die offiziellen Landeswahlleiter-Seiten prüfen.
