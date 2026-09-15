# Kubicki-Monitor – Einrichtung

Ziel: Öffentliche Seite (Teil desselben `fdp-monitor`-Repos) mit Wolfgang Kubickis
Cicero-Beiträgen und Interview-Auftritten pro Woche. Aktualisierung über wöchentliche
Websuche in einer eigenen Claude-Code-Routine, siehe `ROUTINE-PROMPT-KUBICKI.md`.

## Dateien im Paket

| Datei | Zweck | Anfassen? |
|---|---|---|
| `kubicki.html` | Die Seite (Balken Beiträge/Woche, Interviews/Woche nach Sender, Vorschläge) | nur bei Design-Änderungen |
| `kubicki-utils.js` | Reine Hilfsfunktionen (ISO-Kalenderwochen, Gruppierung), getestet mit Vitest | nur bei Logik-Änderungen |
| `kubicki-data.json` | Rohdaten: Beiträge, Interviews, Sender-Liste | wird von der Routine gepflegt, Vorschläge werden von Jan bestätigt |
| `kubicki_stats.py` | Wochen-Report + Validierung für die Routine (Python-Gegenstück zu `kubicki-utils.js`) | nein |
| `ROUTINE-PROMPT-KUBICKI.md` | Wöchentliche Routine (Websuche statt API-Abruf) | einmal einbauen |

Von `index.html` (FDP-Monitor) führt oben rechts ein Link "Kubicki-Monitor →" zu
`kubicki.html` und zurück, beide Seiten teilen sich das Repo und `monitor-utils.js`.

## Datenmodell (`kubicki-data.json`)

```json
{
  "erstellt": "2026-09-15T12:00+02:00",
  "quellen": {
    "cicero_suche": "site:cicero.de Wolfgang Kubicki",
    "sender": ["WELT TV", "ARD", "ZDF", "Phoenix", "Deutschlandfunk"]
  },
  "beitraege": [
    {"titel": "...", "datum": "2026-09-08", "url": "https://www.cicero.de/..."}
  ],
  "interviews": [
    {"sender": "WELT TV", "titel": "...", "datum": "2026-09-10", "url": "...", "status": "bestaetigt"}
  ]
}
```

- `beitraege`: alle Texte von Kubicki auf Cicero (Kolumne "Ungefiltert" + Gastbeiträge),
  von der Routine per Websuche erfasst. Wird ohne weitere Prüfung gezählt.
- `interviews`: `status` ist entweder `"bestaetigt"` (zählt in den Wochen-Balken) oder
  `"vorschlag"` (erscheint nur unter "Unbestätigte Vorschläge", bis Jan es prüft und
  bestätigt oder löscht – siehe `ROUTINE-PROMPT-KUBICKI.md`). Ein manuell selbst
  eingetragenes Interview kann direkt mit `"status": "bestaetigt"` angelegt werden.
- `quellen.sender`: Startliste der Sender, nach denen die Routine sucht. Erweiterbar,
  ohne Codeänderung.

## Warum Websuche statt Skript?

Für Cicero gibt es keine öffentliche API, für Interview-Auftritte kein
sender-übergreifendes Archiv – anders als beim FDP-Monitor (dawum.de-API) lässt sich
das nicht zuverlässig automatisiert abrufen. Die Routine nutzt deshalb Websuche
(wie beim FDP-Monitor schon für den dawum-Wahltrend), und Interviews laufen zusätzlich
über einen Bestätigungsschritt, weil eine reine Websuche Auftritte verpassen oder
falsch zuordnen kann.

## Einrichtung

1. Dateien liegen bereits im selben Repo wie der FDP-Monitor (GitHub Pages ist schon
   eingerichtet, siehe `ANLEITUNG.md`) – nichts zusätzlich zu tun, `kubicki.html` ist
   unter `https://<dein-name>.github.io/fdp-monitor/kubicki.html` erreichbar.
2. Neue Claude-Code-Routine anlegen (Claude Web-UI → Code → Routines), Inhalt von
   `ROUTINE-PROMPT-KUBICKI.md` als Prompt, wöchentlich, Zugriff auf das `fdp-monitor`-Repo.
3. Routine einmal manuell starten.

🎯 **Aufgabe:** Manuellen Lauf abwarten.
**Fertig wenn:** Die Routine meldet neue Beiträge/Interview-Vorschläge (oder "keine
Änderungen"), im Repo ggf. ein Commit „Kubicki-Monitor-Update KW …", und
`kubicki.html` zeigt die aktuellen Wochen-Balken.

## Wöchentlicher Ablauf

1. Routine läuft: sucht neue Cicero-Beiträge und Interview-Kandidaten, trägt sie ein,
   committet bei Änderungen.
2. Jan prüft die "Unbestätigte Vorschläge"-Liste auf `kubicki.html` und bestätigt oder
   löscht jeden Eintrag in `kubicki-data.json` (direkt über GitHub im Browser).

## Bekannte Grenzen

- Interview-Erfassung ist Best-Effort per Websuche – Vollständigkeit ist nicht
  garantiert, deshalb der Bestätigungsschritt statt automatischer Zählung.
- Cicero-Beiträge gelten als verlässlich genug für eine direkte Übernahme ohne
  Bestätigungsschritt; sollte sich das als falsch erweisen (z. B. Falschzuordnungen),
  lässt sich derselbe `"status"`-Mechanismus wie bei Interviews ergänzen.
