# FDP-Monitor – Einrichtung auf GitHub Pages

Ziel: Öffentliche Website mit FDP-Umfragewerten (Bund, NRW: dawum-Wahltrend als Leitzahl, Einzelumfragen live von dawum.de) und Instagram-Posts der fünf Accounts. Aktualisierung über `posts.txt` + `update.py` + Claude-Code-Routine. Der Faktencheck-Bereich ist angelegt, aber per Schalter ausgeblendet (Phase 3 = später).

## Dateien im Paket

| Datei | Zweck | Anfassen? |
|---|---|---|
| `index.html` | Die Website (eine Datei, kein Framework) | nur bei Design-Änderungen |
| `data.json` | Accounts, Posts, Faktenchecks, Umfrage-Fallback | Faktenchecks redaktionell bearbeiten |
| `posts.txt` | Eingangskorb: eine Post-URL pro Zeile | ja, laufend |
| `update.py` | Holt Post-Daten (oEmbed) + Umfragen, schreibt `data.json` | nein |
| `thumbs/` | Vorschaubilder, legt `update.py` an | nein |
| `ROUTINE-PROMPT.md` | Zusatzschritt für die Claude-Code-Routine | einmal einbauen |

Accounts stehen in `data.json` unter `accounts`. Die Namen zu den Handles (Kubicki, Hagen, Höne) bitte einmal gegenprüfen und bei Bedarf dort ändern.

---

## Phase 1 – Repo anlegen und veröffentlichen (ca. 15 Min, Mac oder iPhone im Browser)

1. github.com → oben rechts **+** → **New repository**
   - Name: `fdp-monitor` · Sichtbarkeit: **Public** · Häkchen bei **Add a README** · **Create repository**
2. Im Repo: **Add file** → **Upload files** → alle Dateien aus dem Paket ziehen (inkl. Ordner `thumbs`) → **Commit changes**
3. **Settings** (Reiter oben) → linke Spalte **Pages**
   - Source: **Deploy from a branch** · Branch: **main** · Ordner: **/ (root)** → **Save**
4. 1–2 Minuten warten, Seite neu laden: oben erscheint die Adresse `https://<dein-name>.github.io/fdp-monitor/`

🎯 **Aufgabe:** Adresse im Safari öffnen.
**Fertig wenn:** Kopfzeile „FDP-Monitor" erscheint, unter „Umfragewerte" stehen Balken mit Institutsnamen und die Notiz „Live von dawum.de". Die große Zahl zeigt noch „Wahltrend noch nicht hinterlegt" – das kommt in Phase 2.

Falls die Balken fehlen und „Keine Umfragen gefunden" steht: dawum blockiert den Direktabruf aus dem Browser. Dann Phase 2 durchführen – `update.py` speichert die Werte in `data.json`, die Seite nutzt sie automatisch als Fallback.

---

## Phase 2 – Erste Aktualisierung am Mac (ca. 15 Min)

Voraussetzung: Terminal (vorinstalliert) und Git. Git bringt macOS mit; beim ersten `git`-Aufruf fragt der Mac ggf. nach Installation der Command Line Tools → **Installieren**. Python 3 ist damit ebenfalls vorhanden.

1. Terminal öffnen (Spotlight → „Terminal")
2. Repo holen:
   ```
   cd ~/Documents
   git clone https://github.com/<dein-name>/fdp-monitor.git
   cd fdp-monitor
   ```
3. Wahltrend eintragen (Wert von https://dawum.de/Bundestag/ bzw. https://dawum.de/Nordrhein-Westfalen/, Dezimalpunkt):
   ```
   python3 update.py --nur-trend --trend-bund 4.4 --trend-nrw 5.6
   ```
   Beim ersten Mal ohne Δ; ab dem zweiten Lauf mit anderem Datum berechnet das Skript Δ zur Vorwoche selbst.
4. Eine Test-URL in `posts.txt` schreiben (öffentlicher Post von @fdp; Link aus Instagram: Post → **…** → **Link kopieren**):
   ```
   open -e posts.txt
   ```
   URL einfügen, speichern, schließen.
5. Skript laufen lassen:
   ```
   python3 update.py
   ```
   Erwartete Ausgabe: `→ https://www.instagram.com/p/…`, `1 neue(r) Post(s) aufgenommen.`, `Umfragen gespeichert: …`, `data.json geschrieben.`
6. Hochladen:
   ```
   git add -A
   git commit -m "Erster Post"
   git push
   ```

🎯 **Aufgabe:** Website neu laden.
**Fertig wenn:** Die große Zahl zeigt den Wahltrend mit „dawum-Wahltrend, Stand …", darunter klein den Ø der Einzelumfragen; unter „Instagram-Posts" erscheint eine Karte mit Vorschaubild und Account-Label, Antippen öffnet den Post auf Instagram.

Mögliche Fehler:
- `oEmbed-Fehler 400/404`: Post ist privat, gelöscht oder URL unvollständig.
- `oEmbed-Fehler 429`: Rate-Limit der tokenlosen Abfrage – später erneut versuchen.
- Vorschaubild fehlt, Rest da: `thumbs/` wurde nicht mitgepusht → `git add thumbs` wiederholen.

---

## Phase 3 – Faktencheck eintragen (später; ca. 5 Min)

Einschalten: in `data.json` `"faktencheck_aktiv": true` setzen. Dann manuell, ohne Routine: `data.json` öffnen (TextEdit reicht, besser: GitHub im Browser → Datei → Stift-Symbol). Beim Post die Felder füllen:

```json
"faktencheck": {
  "status": "teils korrekt",
  "text": "Aussage: … Befund: … Einordnung: …",
  "quellen": [ { "titel": "Destatis, Pressemitteilung 123", "url": "https://…" } ],
  "geprueft_am": "2026-08-27"
}
```

Erlaubte `status`-Werte: `korrekt` · `teils korrekt` · `irreführend` · `falsch` · `meinung` · `ungeprüft`. Bei Bearbeitung im Browser: **Commit changes** → Seite ist nach ca. 1 Minute aktuell.

🎯 **Aufgabe:** Einen Post bewerten.
**Fertig wenn:** Badge auf der Karte zeigt den neuen Status in der passenden Farbe (grün/orange/rot/grau) und der Text plus Quellenlink erscheinen beim Aufklappen.

---

## Phase 4 – Routine in Claude Code erweitern (ca. 10 Min)

1. Bestehende Umfrage-Routine öffnen (Claude Web-UI → Code → Routines).
2. Sicherstellen, dass die Routine auf das Repo `fdp-monitor` zugreift (entweder dieselbe Repo-Verbindung wie bisher, falls du die Dateien dort ablegst, oder Repo zusätzlich verbinden).
3. Inhalt von `ROUTINE-PROMPT.md` ab „## Schritt" als weiteren Schritt an den Routine-Prompt anhängen.
4. Routine einmal manuell starten.

🎯 **Aufgabe:** Manuellen Lauf abwarten.
**Fertig wenn:** Die Routine meldet Wahltrend-Werte mit Δ, im Repo gibt es einen Commit „Monitor-Update KW …", und auf der Website steht der neue Wahltrend mit aktuellem Stand-Datum.

Empfehlung: Faktencheck-Entwürfe der Routine vor der Verbreitung einmal lesen. Du gibst frei, indem du den Status stehen lässt oder änderst; die Routine fasst bewertete Posts nicht mehr an.

---

## Phase 5 – iOS-Kurzbefehl „Post an Monitor senden" (ca. 20 Min)

Ergebnis: Instagram → Teilen → Kurzbefehl → URL landet in `posts.txt` auf GitHub. Aktionsnamen in der Kurzbefehle-App können je nach iOS-Version leicht abweichen.

**A) GitHub-Token erstellen (einmalig)**
github.com → Profilbild → **Settings** → ganz unten **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
- Repository access: **Only select repositories** → `fdp-monitor`
- Permissions → Repository permissions → **Contents**: **Read and write**
- Expiration: 1 Jahr → **Generate token** → Token kopieren (wird nur einmal gezeigt)

**B) Kurzbefehl bauen** (App „Kurzbefehle" → **+**)
1. Oben rechts **ⓘ** → **Im Share-Sheet anzeigen** aktivieren; Eingabetyp **URLs**
2. Aktion **Text**: `https://api.github.com/repos/<dein-name>/fdp-monitor/contents/posts.txt` → als Variable `API`
3. Aktion **Inhalte von URL abrufen** (`API`) · Methode **GET** · Header `Authorization` = `Bearer <Token>` → Ergebnis `Antwort`
4. Aktion **Wert aus Wörterbuch abrufen**: Schlüssel `sha` aus `Antwort` → Variable `SHA`
5. Aktion **Wert aus Wörterbuch abrufen**: Schlüssel `content` aus `Antwort` → Aktion **Base64 codieren** (Modus **Decodieren**) → Variable `Alt`
6. Aktion **Text**: `Alt` + Zeilenumbruch + `Kurzbefehl-Eingabe` → Aktion **Base64 codieren** (Modus **Codieren**, Zeilenumbrüche **Keine**) → Variable `Neu`
7. Aktion **Inhalte von URL abrufen** (`API`) · Methode **PUT** · Header `Authorization` = `Bearer <Token>` · Body **JSON**:
   - `message` = `Post hinzugefügt`
   - `content` = `Neu`
   - `sha` = `SHA`
8. Aktion **Mitteilung anzeigen**: „In posts.txt eingetragen"

🎯 **Aufgabe:** In Instagram einen Post → **Teilen** → Kurzbefehl auswählen.
**Fertig wenn:** Mitteilung erscheint und `posts.txt` auf github.com enthält die URL als neue letzte Zeile. Beim nächsten Routine-Lauf erscheint der Post auf der Website.

Hinweis: Der Kurzbefehl trägt nur die URL ein. Vorschaubild und Faktencheck erzeugt die Routine (Phase 4) oder `update.py` am Mac (Phase 2).

---

## Wöchentlicher Ablauf danach

1. Unter der Woche: Posts per Kurzbefehl einwerfen.
2. Routine läuft (Umfragen + Monitor-Update): setzt Wahltrend mit Δ, nimmt neue Posts auf, pusht.
3. Website prüfen; Korrekturen direkt in `data.json` über GitHub im Browser.

## Bekannte Grenzen

- Kein automatischer Feed fremder Accounts: Instagram erlaubt nur die Einbettung einzelner öffentlicher Posts. Die Auswahl bleibt Handarbeit (bewusst).
- `datum` (Veröffentlichungsdatum) liefert Instagram nicht mit; die Routine versucht es zu erkennen, sonst wird das Erfassungsdatum angezeigt.
- Tokenloses oEmbed hat ein Rate-Limit; bei vielen Posts auf einmal `update.py` in zwei Durchgängen laufen lassen.
- Der dawum-Wahltrend steht nicht in der API, sondern nur auf der dawum-Website. Er wird deshalb von der Routine (oder von dir per `--trend-bund/--trend-nrw`) in `data.json` geschrieben; die Seite zeigt zusätzlich den einfachen Ø der neuesten Umfrage je Institut, damit ein Live-Wert auch ohne Routine sichtbar ist.
