"""Tests for update.py's pure, side-effect-free functions."""
import sys
import os
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import update


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

    def test_matches_sachsen_anhalt_regardless_of_separator(self):
        db = self._db(parliament_name="Landtag von Sachsen-Anhalt", shortcut="ST")
        assert len(update.fdp_rows(db, r"sachsen.anhalt")) == 1

    def test_matches_mecklenburg_vorpommern(self):
        db = self._db(parliament_name="Landtag Mecklenburg-Vorpommern", shortcut="MV")
        assert len(update.fdp_rows(db, r"mecklenburg")) == 1

    def test_matches_berlin(self):
        db = self._db(parliament_name="Abgeordnetenhaus von Berlin", shortcut="Berlin")
        assert len(update.fdp_rows(db, r"berlin")) == 1


class TestSetTrend:
    def _d(self, ids=("bund",)):
        return {"ebenen": [{"id": i, "name": i} for i in ids]}

    def test_first_value_has_no_delta(self):
        d = self._d()
        update.set_trend(d, "bund", 4.4, "2026-08-01")
        ebene = d["ebenen"][0]
        assert ebene["wahltrend"] == {"wert": 4.4, "delta": None, "stand": "2026-08-01"}

    def test_second_call_different_stand_computes_delta(self):
        d = self._d()
        update.set_trend(d, "bund", 4.4, "2026-08-01")
        update.set_trend(d, "bund", 4.7, "2026-08-08")
        t = d["ebenen"][0]["wahltrend"]
        assert t["wert"] == 4.7
        assert t["delta"] == 0.3
        assert t["stand"] == "2026-08-08"

    def test_repeated_call_same_stand_keeps_old_delta(self):
        d = self._d()
        update.set_trend(d, "bund", 4.4, "2026-08-01")
        update.set_trend(d, "bund", 4.7, "2026-08-08")
        update.set_trend(d, "bund", 5.0, "2026-08-08")
        t = d["ebenen"][0]["wahltrend"]
        # same "stand" as previous call: delta must not be recomputed from 4.7->5.0
        assert t["delta"] == 0.3
        assert t["wert"] == 5.0

    def test_negative_delta(self):
        d = self._d()
        update.set_trend(d, "bund", 5.6, "2026-08-01")
        update.set_trend(d, "bund", 5.1, "2026-08-08")
        assert d["ebenen"][0]["wahltrend"]["delta"] == -0.5

    def test_value_rounded_to_one_decimal(self):
        d = self._d()
        update.set_trend(d, "bund", 4.449, "2026-08-01")
        assert d["ebenen"][0]["wahltrend"]["wert"] == 4.4

    def test_regions_are_independent(self):
        d = self._d(ids=("bund", "nrw"))
        update.set_trend(d, "bund", 4.4, "2026-08-01")
        update.set_trend(d, "nrw", 5.6, "2026-08-01")
        assert d["ebenen"][0]["wahltrend"]["wert"] == 4.4
        assert d["ebenen"][1]["wahltrend"]["wert"] == 5.6

    def test_unknown_ebene_id_raises(self):
        d = self._d()
        try:
            update.set_trend(d, "does-not-exist", 4.4, "2026-08-01")
            assert False, "expected SystemExit"
        except SystemExit as e:
            assert "does-not-exist" in str(e)


class TestFilterByAge:
    TODAY = date(2026, 8, 27)

    def _rows(self, *dates):
        return [{"institut": "Institut", "datum": d, "fdp": 5.0} for d in dates]

    def test_none_max_age_returns_all_rows_unfiltered(self):
        rows = self._rows("2020-01-01", None)
        assert update.filter_by_age(rows, None, today=self.TODAY) == rows

    def test_drops_rows_older_than_max_age(self):
        rows = self._rows("2026-08-20", "2025-01-01")
        out = update.filter_by_age(rows, 60, today=self.TODAY)
        assert [r["datum"] for r in out] == ["2026-08-20"]

    def test_keeps_row_exactly_at_cutoff(self):
        rows = self._rows("2026-06-28")  # exactly 60 days before TODAY
        out = update.filter_by_age(rows, 60, today=self.TODAY)
        assert len(out) == 1

    def test_drops_rows_with_missing_or_unparseable_date(self):
        rows = self._rows(None, "not-a-date", "2026-08-20")
        out = update.filter_by_age(rows, 60, today=self.TODAY)
        assert [r["datum"] for r in out] == ["2026-08-20"]

    def test_bund_60_days_vs_landtag_180_days(self):
        rows = self._rows("2026-04-01")  # ~148 days before TODAY
        assert update.filter_by_age(rows, 60, today=self.TODAY) == []
        assert len(update.filter_by_age(rows, 180, today=self.TODAY)) == 1
