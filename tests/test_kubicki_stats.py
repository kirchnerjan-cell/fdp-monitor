"""Tests for kubicki_stats.py's pure, side-effect-free functions."""
import sys
import os
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import kubicki_stats as ks


class TestIsoWeekInfo:
    def test_monday_start_of_week(self):
        info = ks.iso_week_info("2026-09-07")
        assert info == {"key": "2026-W37", "week": 37, "year": 2026, "start": "2026-09-07", "end": "2026-09-13"}

    def test_any_weekday_maps_to_the_same_week(self):
        assert ks.iso_week_info("2026-09-10")["key"] == "2026-W37"
        assert ks.iso_week_info("2026-09-13")["key"] == "2026-W37"  # Sonntag

    def test_year_boundary_week_can_belong_to_previous_year(self):
        # 01.01.2027 ist ein Freitag, gehört noch zu KW 53/2026.
        assert ks.iso_week_info("2027-01-01")["key"] == "2026-W53"
        # 04.01.2027 (Montag) ist KW 1/2027.
        assert ks.iso_week_info("2027-01-04")["key"] == "2027-W01"

    def test_missing_or_unparseable_date_returns_none(self):
        assert ks.iso_week_info(None) is None
        assert ks.iso_week_info("") is None
        assert ks.iso_week_info("not-a-date") is None


class TestGroupByWeek:
    def test_groups_and_sorts_chronologically_ascending(self):
        rows = [
            {"datum": "2026-09-10", "titel": "b"},  # KW37
            {"datum": "2026-08-31", "titel": "a"},  # KW36
            {"datum": "2026-09-12", "titel": "c"},  # KW37
        ]
        groups = ks.group_by_week(rows)
        assert [g["key"] for g in groups] == ["2026-W36", "2026-W37"]
        assert [r["titel"] for r in groups[1]["items"]] == ["b", "c"]

    def test_skips_rows_with_missing_or_unparseable_date(self):
        rows = [{"datum": None}, {"datum": "not-a-date"}, {"datum": "2026-09-10"}]
        assert len(ks.group_by_week(rows)) == 1

    def test_custom_date_field(self):
        assert len(ks.group_by_week([{"stand": "2026-09-10"}], date_field="stand")) == 1

    def test_empty_input(self):
        assert ks.group_by_week([]) == []
        assert ks.group_by_week(None) == []


class TestLastNWeeks:
    def test_returns_n_consecutive_weeks_ending_at_today(self):
        weeks = ks.last_n_weeks(4, today=date(2026, 9, 10))  # KW37
        assert [w["key"] for w in weeks] == ["2026-W34", "2026-W35", "2026-W36", "2026-W37"]


class TestCountBy:
    def test_counts_rows_per_field_value(self):
        rows = [{"sender": "WELT TV"}, {"sender": "ZDF"}, {"sender": "WELT TV"}]
        assert ks.count_by(rows, "sender") == {"WELT TV": 2, "ZDF": 1}

    def test_missing_value_falls_back_to_unbekannt(self):
        rows = [{"sender": ""}, {"sender": None}, {}]
        assert ks.count_by(rows, "sender") == {"Unbekannt": 3}

    def test_empty_input(self):
        assert ks.count_by([], "sender") == {}
        assert ks.count_by(None, "sender") == {}


class TestReport:
    def test_reports_counts_per_week_with_sender_breakdown(self):
        d = {
            "beitraege": [{"titel": "x", "datum": "2026-09-08"}],
            "interviews": [
                {"sender": "WELT TV", "datum": "2026-09-08", "status": "bestaetigt"},
                {"sender": "ZDF", "datum": "2026-09-08", "status": "bestaetigt"},
            ],
        }
        text = ks.report(d, wochen=1, today=date(2026, 9, 10))
        assert "2026-W37" in text
        assert "1 Beitrag/Beiträge" in text
        assert "2 Interview(s)" in text
        assert "WELT TV: 1" in text and "ZDF: 1" in text

    def test_vorschlaege_are_excluded_from_the_weekly_count_but_flagged_separately(self):
        d = {
            "beitraege": [],
            "interviews": [{"sender": "WELT TV", "datum": "2026-09-08", "status": "vorschlag"}],
        }
        text = ks.report(d, wochen=1, today=date(2026, 9, 10))
        assert "0 Interview(s)" in text
        assert "unbestätigte" in text

    def test_week_with_no_data_shows_zero_counts(self):
        text = ks.report({"beitraege": [], "interviews": []}, wochen=1, today=date(2026, 9, 10))
        assert "0 Beitrag/Beiträge, 0 Interview(s) [–]" in text
