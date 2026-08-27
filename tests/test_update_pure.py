"""Tests for update.py's pure, side-effect-free functions."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import update


class TestNormUrl:
    def test_post(self):
        assert update.norm_url("https://www.instagram.com/p/ABC123/") == "https://www.instagram.com/p/ABC123/"

    def test_reel_stays_reel(self):
        assert update.norm_url("https://www.instagram.com/reel/XYZ_9-8/") == "https://www.instagram.com/reel/XYZ_9-8/"

    def test_reels_normalized_to_reel(self):
        assert update.norm_url("https://www.instagram.com/reels/XYZ789/") == "https://www.instagram.com/reel/XYZ789/"

    def test_tv(self):
        assert update.norm_url("https://www.instagram.com/tv/DEF456/") == "https://www.instagram.com/tv/DEF456/"

    def test_strips_query_string(self):
        assert update.norm_url("https://www.instagram.com/p/ABC123/?igsh=xyz") == "https://www.instagram.com/p/ABC123/"

    def test_strips_utm_and_other_params(self):
        assert update.norm_url("https://www.instagram.com/reel/ABC123/?utm_source=ig_web_copy_link") == "https://www.instagram.com/reel/ABC123/"

    def test_no_trailing_slash_still_matches(self):
        assert update.norm_url("https://www.instagram.com/p/ABC123") == "https://www.instagram.com/p/ABC123/"

    def test_non_instagram_url_returns_none(self):
        assert update.norm_url("https://example.com/p/ABC123/") is None

    def test_instagram_profile_url_returns_none(self):
        assert update.norm_url("https://www.instagram.com/fdp/") is None

    def test_empty_string_returns_none(self):
        assert update.norm_url("") is None


class TestPostId:
    def test_extracts_id_from_post(self):
        assert update.post_id("https://www.instagram.com/p/ABC123/") == "ABC123"

    def test_extracts_id_from_reel(self):
        assert update.post_id("https://www.instagram.com/reel/XYZ_9-8/") == "XYZ_9-8"

    def test_extracts_id_from_tv(self):
        assert update.post_id("https://www.instagram.com/tv/DEF456/") == "DEF456"


class TestReadInbox:
    def _write(self, tmp_path, content):
        p = tmp_path / "posts.txt"
        p.write_text(content, encoding="utf-8")
        return p

    def test_reads_valid_urls(self, tmp_path, monkeypatch):
        p = self._write(tmp_path, "https://www.instagram.com/p/ABC123/\n")
        monkeypatch.setattr(update, "INBOX", str(p))
        assert update.read_inbox() == ["https://www.instagram.com/p/ABC123/"]

    def test_skips_blank_lines_and_comments(self, tmp_path, monkeypatch):
        p = self._write(
            tmp_path,
            "\n# a comment\nhttps://www.instagram.com/p/ABC123/\n   \n",
        )
        monkeypatch.setattr(update, "INBOX", str(p))
        assert update.read_inbox() == ["https://www.instagram.com/p/ABC123/"]

    def test_deduplicates_normalized_urls(self, tmp_path, monkeypatch):
        p = self._write(
            tmp_path,
            "https://www.instagram.com/p/ABC123/\n"
            "https://www.instagram.com/p/ABC123/?igsh=abc\n",
        )
        monkeypatch.setattr(update, "INBOX", str(p))
        assert update.read_inbox() == ["https://www.instagram.com/p/ABC123/"]

    def test_unrecognized_line_is_skipped_not_raised(self, tmp_path, monkeypatch, capsys):
        p = self._write(tmp_path, "not a url\nhttps://www.instagram.com/p/ABC123/\n")
        monkeypatch.setattr(update, "INBOX", str(p))
        assert update.read_inbox() == ["https://www.instagram.com/p/ABC123/"]
        assert "keine Post-URL erkannt" in capsys.readouterr().out

    def test_missing_file_returns_empty_list(self, tmp_path, monkeypatch):
        monkeypatch.setattr(update, "INBOX", str(tmp_path / "does-not-exist.txt"))
        assert update.read_inbox() == []


class TestFdpRows:
    def _db(self, results=None, parliament_name="Deutscher Bundestag", shortcut="BT"):
        return {
            "Parties": {"1": {"Shortcut": "FDP"}, "2": {"Shortcut": "CDU"}},
            "Parliaments": {"10": {"Shortcut": shortcut, "Name": parliament_name}},
            "Institutes": {"5": {"Name": "Forsa"}},
            "Surveys": {
                "100": {
                    "Parliament_ID": 10,
                    "Institute_ID": 5,
                    "Date": "2026-08-01",
                    "Results": results if results is not None else {"1": 4.5, "2": 30.0},
                }
            },
        }

    def test_extracts_fdp_result_for_matching_parliament(self):
        rows = update.fdp_rows(self._db(), r"bundestag")
        assert rows == [{"institut": "Forsa", "datum": "2026-08-01", "fdp": 4.5}]

    def test_no_matching_parliament_returns_empty(self):
        rows = update.fdp_rows(self._db(), r"nordrhein")
        assert rows == []

    def test_survey_missing_fdp_result_is_skipped(self):
        db = self._db(results={"2": 30.0})
        assert update.fdp_rows(db, r"bundestag") == []

    def test_no_fdp_party_in_db_returns_empty(self):
        db = self._db()
        del db["Parties"]["1"]
        assert update.fdp_rows(db, r"bundestag") == []

    def test_sorted_by_date_descending(self):
        db = self._db()
        db["Surveys"]["101"] = {
            "Parliament_ID": 10, "Institute_ID": 5,
            "Date": "2026-08-15", "Results": {"1": 5.0},
        }
        rows = update.fdp_rows(db, r"bundestag")
        assert [r["datum"] for r in rows] == ["2026-08-15", "2026-08-01"]

    def test_survey_with_missing_date_sorts_last(self):
        db = self._db()
        db["Surveys"]["101"] = {
            "Parliament_ID": 10, "Institute_ID": 5,
            "Date": None, "Results": {"1": 5.0},
        }
        rows = update.fdp_rows(db, r"bundestag")
        assert rows[0]["datum"] == "2026-08-01"
        assert rows[-1]["datum"] is None

    def test_matches_via_shortcut_not_just_name(self):
        db = self._db(parliament_name="Landtag", shortcut="NRW")
        rows = update.fdp_rows(db, r"nrw")
        assert len(rows) == 1


class TestSetTrend:
    def test_first_value_has_no_delta(self):
        d = {}
        update.set_trend(d, "bundestag", 4.4, "2026-08-01")
        assert d["wahltrend"]["bundestag"] == {"wert": 4.4, "delta": None, "stand": "2026-08-01"}

    def test_second_call_different_stand_computes_delta(self):
        d = {}
        update.set_trend(d, "bundestag", 4.4, "2026-08-01")
        update.set_trend(d, "bundestag", 4.7, "2026-08-08")
        t = d["wahltrend"]["bundestag"]
        assert t["wert"] == 4.7
        assert t["delta"] == 0.3
        assert t["stand"] == "2026-08-08"

    def test_repeated_call_same_stand_keeps_old_delta(self):
        d = {}
        update.set_trend(d, "bundestag", 4.4, "2026-08-01")
        update.set_trend(d, "bundestag", 4.7, "2026-08-08")
        update.set_trend(d, "bundestag", 5.0, "2026-08-08")
        t = d["wahltrend"]["bundestag"]
        # same "stand" as previous call: delta must not be recomputed from 4.7->5.0
        assert t["delta"] == 0.3
        assert t["wert"] == 5.0

    def test_negative_delta(self):
        d = {}
        update.set_trend(d, "nrw", 5.6, "2026-08-01")
        update.set_trend(d, "nrw", 5.1, "2026-08-08")
        assert d["wahltrend"]["nrw"]["delta"] == -0.5

    def test_value_rounded_to_one_decimal(self):
        d = {}
        update.set_trend(d, "bundestag", 4.449, "2026-08-01")
        assert d["wahltrend"]["bundestag"]["wert"] == 4.4

    def test_keys_are_independent(self):
        d = {}
        update.set_trend(d, "bundestag", 4.4, "2026-08-01")
        update.set_trend(d, "nrw", 5.6, "2026-08-01")
        assert "bundestag" in d["wahltrend"] and "nrw" in d["wahltrend"]
