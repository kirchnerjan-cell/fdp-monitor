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
