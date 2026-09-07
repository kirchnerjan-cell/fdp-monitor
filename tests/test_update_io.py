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
