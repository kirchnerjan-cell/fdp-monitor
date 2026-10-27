"""Tests for update.py's I/O-driving functions, with network calls mocked out."""
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import update


class TestLoadSaveData:
    def test_round_trip(self, tmp_path, monkeypatch):
        data_file = tmp_path / "data.json"
        monkeypatch.setattr(update, "DATA", str(data_file))
        d = {"ebenen": [], "erstellt": "2026-08-27T10:00"}
        update.save_data(d)
        assert update.load_data() == d

    def test_save_writes_utf8_with_trailing_newline(self, tmp_path, monkeypatch):
        data_file = tmp_path / "data.json"
        monkeypatch.setattr(update, "DATA", str(data_file))
        update.save_data({"note": "Prüfung"})
        raw = data_file.read_text(encoding="utf-8")
        assert raw.endswith("\n")
        assert "Prüfung" in raw
        assert "\\u" not in raw  # ensure_ascii=False: no escape sequences


class TestNurBeiAenderungSchreiben:
    """main() darf data.json nur anfassen, wenn sich inhaltlich etwas geändert hat -
    sonst entsteht bei jedem Routinelauf ein Commit, der nur den Zeitstempel enthält."""

    ALT = "2026-09-07T10:13+02:00"

    def _datei(self, tmp_path, monkeypatch):
        f = tmp_path / "data.json"
        monkeypatch.setattr(update, "DATA", str(f))
        update.save_data({
            "erstellt": self.ALT,
            "ebenen": [{
                "id": "bund", "name": "Bundestagswahl", "parlament_regex": "bundestag",
                "wahltrend": {"wert": 4.3, "delta": -0.1, "stand": "2026-09-07"},
                "umfragen": {"stand": "2026-09-06", "rows": []},
            }],
        })
        return f

    def test_ohne_aenderung_bleibt_die_datei_unangetastet(self, tmp_path, monkeypatch, capsys):
        f = self._datei(tmp_path, monkeypatch)
        vorher = f.read_text(encoding="utf-8")
        monkeypatch.setattr(sys, "argv", ["update.py", "--nur-trend"])
        update.main()
        assert f.read_text(encoding="utf-8") == vorher
        assert json.loads(vorher)["erstellt"] == self.ALT
        assert "Keine inhaltlichen Änderungen" in capsys.readouterr().out

    def test_gleicher_trendwert_am_gleichen_tag_aendert_nichts(self, tmp_path, monkeypatch):
        # Genau der Fall aus dem Echtbetrieb: zweiter Lauf am selben Tag, dawum
        # liefert nichts Neues, der Trend steht bereits auf demselben Wert.
        f = self._datei(tmp_path, monkeypatch)
        vorher = f.read_text(encoding="utf-8")
        monkeypatch.setattr(sys, "argv",
                            ["update.py", "--nur-trend", "--stand", "2026-09-07", "--trend", "bund", "4.3"])
        update.main()
        assert f.read_text(encoding="utf-8") == vorher

    def test_neuer_trendwert_schreibt_und_aktualisiert_erstellt(self, tmp_path, monkeypatch, capsys):
        f = self._datei(tmp_path, monkeypatch)
        monkeypatch.setattr(sys, "argv",
                            ["update.py", "--nur-trend", "--stand", "2026-09-14", "--trend", "bund", "4.7"])
        update.main()
        neu = json.loads(f.read_text(encoding="utf-8"))
        assert neu["ebenen"][0]["wahltrend"]["wert"] == 4.7
        assert neu["erstellt"] != self.ALT
        assert "data.json geschrieben" in capsys.readouterr().out

    def test_neue_umfragen_schreiben_ebenfalls(self, tmp_path, monkeypatch):
        f = self._datei(tmp_path, monkeypatch)
        db = {
            "Database": {"Last_Update": "2026-09-07"},
            "Parties": {"1": {"Shortcut": "FDP"}},
            "Parliaments": {"10": {"Shortcut": "BT", "Name": "Bundestag"}},
            "Institutes": {"5": {"Name": "Forsa"}},
            "Surveys": {"100": {"Parliament_ID": 10, "Institute_ID": 5,
                                 "Date": "2026-09-05", "Results": {"1": 4.0}}},
        }
        monkeypatch.setattr(update, "get", lambda url, timeout=20: json.dumps(db).encode("utf-8"))
        monkeypatch.setattr(sys, "argv", ["update.py"])
        update.main()
        neu = json.loads(f.read_text(encoding="utf-8"))
        assert len(neu["ebenen"][0]["umfragen"]["rows"]) == 1
        assert neu["erstellt"] != self.ALT


class TestInhaltSignatur:
    def test_ignoriert_erstellt(self):
        a = {"erstellt": "2026-09-07T10:00", "ebenen": [{"id": "bund"}]}
        b = {"erstellt": "2026-09-14T11:22", "ebenen": [{"id": "bund"}]}
        assert update.inhalt_signatur(a) == update.inhalt_signatur(b)

    def test_erkennt_aenderung_in_den_ebenen(self):
        a = {"ebenen": [{"id": "bund", "wahltrend": {"wert": 4.3}}]}
        b = {"ebenen": [{"id": "bund", "wahltrend": {"wert": 4.4}}]}
        assert update.inhalt_signatur(a) != update.inhalt_signatur(b)

    def test_schluesselreihenfolge_egal(self):
        a = {"ebenen": [{"id": "bund", "kurz": "Bund"}]}
        b = {"ebenen": [{"kurz": "Bund", "id": "bund"}]}
        assert update.inhalt_signatur(a) == update.inhalt_signatur(b)


class TestUpdatePolls:
    def _fake_db(self):
        return {
            "Database": {"Last_Update": "2026-08-20"},
            "Parties": {"1": {"Shortcut": "FDP"}},
            "Parliaments": {
                "10": {"Shortcut": "BT", "Name": "Bundestag"},
                "20": {"Shortcut": "NRW", "Name": "Landtag Nordrhein-Westfalen"},
            },
            "Institutes": {"5": {"Name": "Forsa"}},
            "Surveys": {
                "100": {"Parliament_ID": 10, "Institute_ID": 5, "Date": "2026-08-01", "Results": {"1": 4.5}},
                "200": {"Parliament_ID": 20, "Institute_ID": 5, "Date": "2026-08-01", "Results": {"1": 5.5}},
            },
        }

    def test_updates_umfragen_for_every_ebene(self, monkeypatch):
        monkeypatch.setattr(update, "get", lambda url, timeout=20: json.dumps(self._fake_db()).encode("utf-8"))
        d = {"ebenen": [
            {"id": "bund", "name": "Bundestagswahl", "parlament_regex": "bundestag"},
            {"id": "nrw", "name": "Landtagswahl NRW", "parlament_regex": "nordrhein"},
        ]}
        update.update_polls(d)
        bund, nrw = d["ebenen"]
        assert bund["umfragen"]["stand"] == "2026-08-20"
        assert bund["umfragen"]["rows"] == [{"institut": "Forsa", "datum": "2026-08-01", "fdp": 4.5}]
        assert nrw["umfragen"]["rows"] == [{"institut": "Forsa", "datum": "2026-08-01", "fdp": 5.5}]

    def test_ebene_with_no_matching_surveys_gets_empty_rows(self, monkeypatch):
        monkeypatch.setattr(update, "get", lambda url, timeout=20: json.dumps(self._fake_db()).encode("utf-8"))
        d = {"ebenen": [{"id": "berlin", "name": "Berlin", "parlament_regex": "berlin"}]}
        update.update_polls(d)
        assert d["ebenen"][0]["umfragen"]["rows"] == []

    def test_applies_ebenes_own_umfrage_max_alter_tage(self, monkeypatch):
        db = self._fake_db()
        db["Database"]["Last_Update"] = "2026-08-27"
        db["Surveys"]["100"]["Date"] = "2026-01-01"  # far older than 60 days before 2026-08-27
        monkeypatch.setattr(update, "get", lambda url, timeout=20: json.dumps(db).encode("utf-8"))
        d = {"ebenen": [{"id": "bund", "name": "Bundestagswahl", "parlament_regex": "bundestag", "umfrage_max_alter_tage": 60}]}
        update.update_polls(d)
        assert d["ebenen"][0]["umfragen"]["rows"] == []

    def test_ebene_without_max_alter_tage_keeps_all_rows(self, monkeypatch):
        db = self._fake_db()
        db["Surveys"]["100"]["Date"] = "2019-01-01"
        monkeypatch.setattr(update, "get", lambda url, timeout=20: json.dumps(db).encode("utf-8"))
        d = {"ebenen": [{"id": "bund", "name": "Bundestagswahl", "parlament_regex": "bundestag"}]}
        update.update_polls(d)
        assert len(d["ebenen"][0]["umfragen"]["rows"]) == 1

    def test_network_failure_preserves_old_umfragen(self, monkeypatch, capsys):
        def failing_get(url, timeout=20):
            raise TimeoutError("dawum unreachable")

        monkeypatch.setattr(update, "get", failing_get)
        old = {"stand": "2026-08-01", "rows": [{"institut": "Alt", "datum": "2026-08-01", "fdp": 4.0}]}
        d = {"ebenen": [{"id": "bund", "name": "Bundestagswahl", "parlament_regex": "bundestag", "umfragen": dict(old)}]}
        update.update_polls(d)
        assert d["ebenen"][0]["umfragen"] == old
        assert "nicht erreichbar" in capsys.readouterr().out

    def test_invalid_json_preserves_old_umfragen(self, monkeypatch):
        monkeypatch.setattr(update, "get", lambda url, timeout=20: b"not json")
        old = {"stand": "2026-08-01", "rows": []}
        d = {"ebenen": [{"id": "bund", "name": "Bundestagswahl", "parlament_regex": "bundestag", "umfragen": dict(old)}]}
        update.update_polls(d)
        assert d["ebenen"][0]["umfragen"] == old


class TestVeralteteTrendsImLauf:
    """Die Alterung des Wahltrends im Zusammenspiel mit main().

    main() rechnet gegen das echte Heute, deshalb werden die Stand-Daten hier relativ
    dazu gesetzt. Fest eingetragene Daten würden mit der Zeit ihre Bedeutung verlieren:
    ein "frischer" Stand wäre irgendwann selbst veraltet und der Test schlüge grundlos fehl.
    """

    @staticmethod
    def _tage_her(n):
        from datetime import datetime, timedelta
        return (datetime.now(update.TZ).date() - timedelta(days=n)).isoformat()

    def _datei(self, tmp_path, monkeypatch, stand=None):
        stand = stand or self._tage_her(47)  # deutlich über der 35-Tage-Grenze
        f = tmp_path / "data.json"
        monkeypatch.setattr(update, "DATA", str(f))
        update.save_data({
            "erstellt": "2026-10-12T09:20+02:00",
            "ebenen": [{
                "id": "nrw", "name": "Landtagswahl NRW", "parlament_regex": "nordrhein",
                "wahltrend_max_alter_tage": 35,
                "wahltrend": {"wert": 6.2, "delta": None, "stand": stand},
                "umfragen": {"stand": "2026-09-23", "rows": []},
            }],
        })
        return f

    def test_veralteter_trend_wird_im_lauf_verworfen(self, tmp_path, monkeypatch):
        f = self._datei(tmp_path, monkeypatch)
        monkeypatch.setattr(sys, "argv", ["update.py", "--nur-trend"])
        update.main()
        assert json.loads(f.read_text(encoding="utf-8"))["ebenen"][0]["wahltrend"] == update.TREND_LEER

    def test_in_diesem_lauf_gesetzter_trend_ueberlebt(self, tmp_path, monkeypatch):
        # Liefert dawum wieder einen Wert, darf die Alterung ihn nicht gleich wieder wegräumen.
        f = self._datei(tmp_path, monkeypatch)
        heute = self._tage_her(0)
        monkeypatch.setattr(sys, "argv",
                            ["update.py", "--nur-trend", "--stand", heute, "--trend", "nrw", "4.1"])
        update.main()
        t = json.loads(f.read_text(encoding="utf-8"))["ebenen"][0]["wahltrend"]
        assert t["wert"] == 4.1 and t["stand"] == heute

    def test_frischer_trend_loest_keinen_leerlauf_commit_aus(self, tmp_path, monkeypatch, capsys):
        # Ist nichts zu verwerfen, muss der Lauf weiterhin als "keine Änderung" enden.
        f = self._datei(tmp_path, monkeypatch, stand=self._tage_her(1))
        vorher = f.read_text(encoding="utf-8")
        monkeypatch.setattr(sys, "argv", ["update.py", "--nur-trend"])
        update.main()
        assert f.read_text(encoding="utf-8") == vorher
        assert "Keine inhaltlichen Änderungen" in capsys.readouterr().out


class TestAbgeschlosseneWahlenWerdenUebersprungen:
    def _db(self):
        return {
            "Database": {"Last_Update": "2026-10-12"},
            "Parties": {"1": {"Shortcut": "FDP"}},
            "Parliaments": {"10": {"Shortcut": "BT", "Name": "Bundestag"},
                            "20": {"Shortcut": "ST", "Name": "Landtag von Sachsen-Anhalt"}},
            "Institutes": {"5": {"Name": "Forsa"}},
            "Surveys": {
                "100": {"Parliament_ID": 10, "Institute_ID": 5, "Date": "2026-10-10", "Results": {"1": 4.0}},
                "200": {"Parliament_ID": 20, "Institute_ID": 5, "Date": "2026-10-10", "Results": {"1": 3.0}},
            },
        }

    def _ebenen(self):
        return [
            {"id": "bund", "name": "Bundestagswahl", "parlament_regex": "bundestag"},
            {"id": "sachsen-anhalt", "name": "Landtagswahl Sachsen-Anhalt",
             "parlament_regex": "sachsen.anhalt",
             "wahlergebnis": {"fdp": 2.6, "datum": "2026-09-06"},
             "umfragen": {"stand": "2026-09-03", "rows": []}},
        ]

    def test_abgeschlossene_ebene_bekommt_keine_neuen_umfragen(self, monkeypatch, capsys):
        monkeypatch.setattr(update, "get", lambda url, timeout=20: json.dumps(self._db()).encode("utf-8"))
        d = {"ebenen": self._ebenen()}
        update.update_polls(d)
        assert len(d["ebenen"][0]["umfragen"]["rows"]) == 1          # Bund: ganz normal
        assert d["ebenen"][1]["umfragen"]["rows"] == []              # ST: trotz Treffer leer
        assert "1 abgeschlossene Wahl(en) übersprungen" in capsys.readouterr().out

    def test_sind_alle_wahlen_gelaufen_wird_dawum_nicht_abgefragt(self, monkeypatch, capsys):
        def darf_nicht(url, timeout=20):
            raise AssertionError("dawum wurde trotz abgeschlossener Wahlen abgefragt")

        monkeypatch.setattr(update, "get", darf_nicht)
        d = {"ebenen": [self._ebenen()[1]]}
        update.update_polls(d)
        assert "dawum wird nicht abgefragt" in capsys.readouterr().out

    def test_ein_vorlaeufiges_ergebnis_wird_weiter_abgefragt(self, monkeypatch):
        monkeypatch.setattr(update, "get", lambda url, timeout=20: json.dumps(self._db()).encode("utf-8"))
        ebenen = self._ebenen()
        ebenen[1]["wahlergebnis"]["vorlaeufig"] = True
        d = {"ebenen": ebenen}
        update.update_polls(d)
        assert len(d["ebenen"][1]["umfragen"]["rows"]) == 1

    def test_main_ersetzt_umfragen_und_schreibt(self, tmp_path, monkeypatch):
        f = tmp_path / "data.json"
        monkeypatch.setattr(update, "DATA", str(f))
        update.save_data({"erstellt": "alt", "ebenen": [
            {"id": "st", "name": "Landtagswahl", "parlament_regex": "sachsen.anhalt",
             "wahlergebnis": {"fdp": 2.6, "datum": "2026-09-06"},
             "umfragen": {"stand": "2026-09-03",
                          "rows": [{"institut": "INSA", "datum": "2026-09-02", "fdp": 3.0}]}}]})
        monkeypatch.setattr(sys, "argv", ["update.py"])   # ohne --nur-trend, also mit Abruf
        monkeypatch.setattr(update, "get", lambda url, timeout=20: (_ for _ in ()).throw(
            AssertionError("dawum darf hier nicht abgefragt werden")))
        update.main()
        neu = json.loads(f.read_text(encoding="utf-8"))
        assert neu["ebenen"][0]["umfragen"] == {"stand": "2026-09-06", "rows": []}


class TestUpdateVerlauf:
    """Die Zeitreihe kommt aus der vollständigen dawum-Datenbank – und nur dann, wenn
    eine Ebene sie überhaupt anfordert."""

    def _db(self):
        return {
            "Database": {"Last_Update": "2026-10-24"},
            "Parties": {"1": {"Shortcut": "FDP"}},
            "Parliaments": {"10": {"Shortcut": "BT", "Name": "Deutscher Bundestag"}},
            "Institutes": {"5": {"Name": "INSA"}},
            "Surveys": {
                "100": {"Parliament_ID": 10, "Institute_ID": 5, "Date": "2026-10-20", "Results": {"1": 4.0}},
                "101": {"Parliament_ID": 10, "Institute_ID": 5, "Date": "2026-10-13", "Results": {"1": 5.0}},
            },
        }

    def _bund(self, **extra):
        e = {"id": "bund", "name": "Bundestagswahl", "parlament_regex": "bundestag",
             "verlauf_tage": 90}
        e.update(extra)
        return e

    def test_holt_und_speichert_die_zeitreihe(self, monkeypatch, capsys):
        monkeypatch.setattr(update, "get", lambda url, timeout=20: json.dumps(self._db()).encode("utf-8"))
        d = {"ebenen": [self._bund()]}
        update.update_verlauf(d)
        v = d["ebenen"][0]["verlauf"]
        assert v["tage"] == 90 and v["stand"] == "2026-10-24"
        assert [r["fdp"] for r in v["rows"]] == [5.0, 4.0]          # älteste zuerst
        assert "Zeitverlauf gespeichert" in capsys.readouterr().out

    def test_ruft_die_gesamtdatenbank_ab_nicht_newest_surveys(self, monkeypatch):
        gerufen = []

        def merken(url, timeout=20):
            gerufen.append(url)
            return json.dumps(self._db()).encode("utf-8")

        monkeypatch.setattr(update, "get", merken)
        update.update_verlauf({"ebenen": [self._bund()]})
        assert gerufen == [update.DAWUM_VOLL]
        assert "newest_surveys" not in gerufen[0]

    def test_ohne_verlauf_tage_wird_nichts_abgerufen(self, monkeypatch):
        def darf_nicht(url, timeout=20):
            raise AssertionError("ohne verlauf_tage darf kein Abruf erfolgen")

        monkeypatch.setattr(update, "get", darf_nicht)
        d = {"ebenen": [{"id": "nrw", "name": "NRW", "parlament_regex": "nordrhein"}]}
        update.update_verlauf(d)
        assert "verlauf" not in d["ebenen"][0]

    def test_abgeschlossene_wahl_bekommt_keine_zeitreihe(self, monkeypatch):
        def darf_nicht(url, timeout=20):
            raise AssertionError("für eine entschiedene Wahl darf kein Abruf erfolgen")

        monkeypatch.setattr(update, "get", darf_nicht)
        d = {"ebenen": [self._bund(wahlergebnis={"fdp": 4.0, "datum": "2026-09-06"})]}
        update.update_verlauf(d)
        assert "verlauf" not in d["ebenen"][0]

    def test_bei_netzfehler_bleibt_die_alte_zeitreihe_stehen(self, monkeypatch, capsys):
        def kaputt(url, timeout=20):
            raise TimeoutError("dawum weg")

        monkeypatch.setattr(update, "get", kaputt)
        alt = {"stand": "2026-10-17", "tage": 90, "rows": [{"institut": "INSA", "datum": "2026-10-01", "fdp": 4.0}]}
        d = {"ebenen": [self._bund(verlauf=dict(alt))]}
        update.update_verlauf(d)
        assert d["ebenen"][0]["verlauf"] == alt
        assert "nicht erreichbar" in capsys.readouterr().out
