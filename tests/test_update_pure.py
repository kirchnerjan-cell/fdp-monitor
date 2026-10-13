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

    def test_matches_saarland_also_in_its_genitive_form(self):
        # dawum kann "Saarland" oder "Landtag des Saarlandes" schreiben.
        for name in ("Saarland", "Landtag des Saarlandes"):
            assert len(update.fdp_rows(self._db(parliament_name=name, shortcut="SL"), r"saarland")) == 1

    def test_matches_schleswig_holstein(self):
        for name in ("Schleswig-Holstein", "Landtag von Schleswig-Holstein"):
            assert len(update.fdp_rows(self._db(parliament_name=name, shortcut="SH"), r"schleswig")) == 1

    def test_matches_bremen_including_the_buergerschaft_spelling(self):
        # "bremen" als Regex würde "Bremische Bürgerschaft" verfehlen – daher "brem".
        for name in ("Bremen", "Bremische Bürgerschaft"):
            assert len(update.fdp_rows(self._db(parliament_name=name, shortcut="HB"), r"brem")) == 1

    def test_matches_niedersachsen_in_both_spellings(self):
        # "niedersachsen" als Regex würde "Niedersächsischer Landtag" verfehlen – daher "nieders".
        for name in ("Niedersachsen", "Niedersächsischer Landtag", "Landtag Niedersachsen"):
            assert len(update.fdp_rows(self._db(parliament_name=name, shortcut="NI"), r"nieders")) == 1

    def test_niedersachsen_regex_does_not_catch_sachsen_anhalt(self):
        # Beide enthalten "sachsen" – die Regexe dürfen sich nicht überschneiden.
        assert update.fdp_rows(self._db(parliament_name="Landtag von Sachsen-Anhalt", shortcut="ST"),
                               r"nieders") == []
        assert update.fdp_rows(self._db(parliament_name="Niedersächsischer Landtag", shortcut="NI"),
                               r"sachsen.anhalt") == []

    def test_bremen_regex_does_not_swallow_other_parliaments(self):
        for name in ("Deutscher Bundestag", "Landtag von Schleswig-Holstein", "Abgeordnetenhaus von Berlin"):
            assert update.fdp_rows(self._db(parliament_name=name, shortcut="XX"), r"brem") == []

    def test_every_parlament_regex_in_data_json_matches_only_its_own_ebene(self):
        """Die echten Regexe aus data.json gegeneinander prüfen: jeder darf genau
        sein eigenes Parlament treffen und keines der anderen."""
        import json, os, re
        pfad = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data.json")
        ebenen = json.load(open(pfad, encoding="utf-8"))["ebenen"]
        # So könnte dawum die Parlamente benennen ("<Shortcut> <Name>").
        namen = {
            "bund": "BT Deutscher Bundestag",
            "sachsen-anhalt": "ST Landtag von Sachsen-Anhalt",
            "mecklenburg-vorpommern": "MV Landtag Mecklenburg-Vorpommern",
            "berlin": "BE Abgeordnetenhaus von Berlin",
            "nrw": "NW Landtag Nordrhein-Westfalen",
            "saarland": "SL Landtag des Saarlandes",
            "schleswig-holstein": "SH Landtag von Schleswig-Holstein",
            "bremen": "HB Bremische Bürgerschaft",
            "niedersachsen": "NI Niedersächsischer Landtag",
        }
        for e in ebenen:
            assert e["id"] in namen, f"Testdaten kennen die Ebene '{e['id']}' nicht"
            treffer = [i for i, n in namen.items() if re.search(e["parlament_regex"], n, re.I)]
            assert treffer == [e["id"]], f"{e['id']}: Regex trifft {treffer}"


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


class TestFilterTrend:
    TODAY = date(2026, 10, 12)

    def _t(self, wert=6.2, stand="2026-08-26"):
        return {"wert": wert, "delta": 0.3, "stand": stand}

    def test_none_max_age_keeps_trend_unfiltered(self):
        t = self._t()
        assert update.filter_trend(t, None, today=self.TODAY) is t

    def test_fresh_trend_is_kept(self):
        t = self._t(stand="2026-10-11")
        assert update.filter_trend(t, 35, today=self.TODAY) is t

    def test_stale_trend_is_discarded(self):
        # genau der NRW-Fall: Stand 26.08., 47 Tage alt, Grenze 35 Tage
        assert update.filter_trend(self._t(), 35, today=self.TODAY) == update.TREND_LEER

    def test_keeps_trend_exactly_at_cutoff(self):
        t = self._t(stand="2026-09-07")  # genau 35 Tage vor TODAY
        assert update.filter_trend(t, 35, today=self.TODAY) is t

    def test_discards_one_day_past_cutoff(self):
        assert update.filter_trend(self._t(stand="2026-09-06"), 35, today=self.TODAY) == update.TREND_LEER

    def test_trend_without_value_is_returned_as_is(self):
        t = {"wert": None, "delta": None, "stand": None}
        assert update.filter_trend(t, 35, today=self.TODAY) is t

    def test_trend_with_value_but_no_stand_is_discarded(self):
        assert update.filter_trend({"wert": 6.2, "delta": None, "stand": None}, 35,
                                   today=self.TODAY) == update.TREND_LEER

    def test_unparseable_stand_is_discarded(self):
        assert update.filter_trend(self._t(stand="irgendwann"), 35,
                                   today=self.TODAY) == update.TREND_LEER

    def test_bund_21_days_is_stricter_than_laender_35(self):
        t = self._t(stand="2026-09-15")  # 27 Tage alt
        assert update.filter_trend(t, 21, today=self.TODAY) == update.TREND_LEER
        assert update.filter_trend(t, 35, today=self.TODAY) is t


class TestDropStaleTrends:
    TODAY = date(2026, 10, 12)

    def test_discards_only_the_stale_ebene(self, capsys):
        d = {"ebenen": [
            {"id": "bund", "wahltrend_max_alter_tage": 21,
             "wahltrend": {"wert": 3.8, "delta": -0.1, "stand": "2026-10-11"}},
            {"id": "nrw", "wahltrend_max_alter_tage": 35,
             "wahltrend": {"wert": 6.2, "delta": None, "stand": "2026-08-26"}},
        ]}
        update.drop_stale_trends(d, today=self.TODAY)
        assert d["ebenen"][0]["wahltrend"]["wert"] == 3.8
        assert d["ebenen"][1]["wahltrend"] == update.TREND_LEER
        assert "nrw" in capsys.readouterr().out

    def test_ebene_without_max_alter_keeps_even_an_ancient_trend(self):
        d = {"ebenen": [{"id": "x", "wahltrend": {"wert": 9.9, "delta": None, "stand": "2019-01-01"}}]}
        update.drop_stale_trends(d, today=self.TODAY)
        assert d["ebenen"][0]["wahltrend"]["wert"] == 9.9

    def test_ebene_without_any_trend_is_untouched(self):
        d = {"ebenen": [{"id": "saarland", "wahltrend_max_alter_tage": 35}]}
        update.drop_stale_trends(d, today=self.TODAY)
        assert "wahltrend" not in d["ebenen"][0]

    def test_data_json_uses_the_field_on_every_ebene(self):
        """Ohne das Feld greift die Alterung nicht – es darf keine Ebene fehlen."""
        import json, os
        pfad = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data.json")
        for e in json.load(open(pfad, encoding="utf-8"))["ebenen"]:
            assert isinstance(e.get("wahltrend_max_alter_tage"), int), e["id"]


class TestStandIstPflicht:
    """--trend ohne --stand hätte das Abrufdatum als Trend-Datum gespeichert. Dann wirkt
    der Wert aktueller als er ist und filter_trend() altert ihn zu spät aus."""

    def test_trend_ohne_stand_bricht_ab(self, monkeypatch):
        monkeypatch.setattr(sys, "argv", ["update.py", "--nur-trend", "--trend", "bund", "4.4"])
        try:
            update.main()
            assert False, "erwartet: SystemExit"
        except SystemExit as e:
            assert "--stand" in str(e)

    def test_ohne_trend_ist_stand_weiter_optional(self, tmp_path, monkeypatch):
        # Ein Lauf, der nur Umfragen holt, braucht kein Trend-Datum.
        f = tmp_path / "data.json"
        monkeypatch.setattr(update, "DATA", str(f))
        update.save_data({"erstellt": "x", "ebenen": []})
        monkeypatch.setattr(sys, "argv", ["update.py", "--nur-trend"])
        update.main()  # darf nicht abbrechen


class TestAbgeschlossen:
    """Eine Wahl mit endgültigem amtlichem Ergebnis wird nicht weiter abgefragt."""

    def test_endgueltiges_ergebnis_schliesst_ab(self):
        assert update.abgeschlossen({"wahlergebnis": {"fdp": 2.6, "datum": "2026-09-06"}})

    def test_vorlaeufiges_ergebnis_schliesst_nicht_ab(self):
        # Bis der Landeswahlausschuss entschieden hat, läuft die Aktualisierung weiter.
        assert not update.abgeschlossen(
            {"wahlergebnis": {"fdp": 2.5, "datum": "2026-09-20", "vorlaeufig": True}})

    def test_ohne_ergebnis_offen(self):
        assert not update.abgeschlossen({"wahlergebnis": None})
        assert not update.abgeschlossen({})

    def test_ergebnis_ohne_wert_offen(self):
        assert not update.abgeschlossen({"wahlergebnis": {"datum": "2026-09-06"}})


class TestErgebnisErsetztUmfragen:
    def _ebene(self, rows, erg):
        return {"id": "x", "name": "Testwahl", "wahlergebnis": erg,
                "umfragen": {"stand": "2026-09-03", "rows": rows}}

    ROWS = [{"institut": "INSA", "datum": "2026-09-02", "fdp": 3.0}]

    def test_verwirft_die_umfragen_und_setzt_den_stand_aufs_wahldatum(self, capsys):
        d = {"ebenen": [self._ebene(self.ROWS, {"fdp": 2.6, "datum": "2026-09-06"})]}
        update.ergebnis_ersetzt_umfragen(d)
        assert d["ebenen"][0]["umfragen"] == {"stand": "2026-09-06", "rows": []}
        assert "ersetzt" in capsys.readouterr().out

    def test_laesst_eine_offene_wahl_unberuehrt(self):
        d = {"ebenen": [self._ebene(self.ROWS, None)]}
        update.ergebnis_ersetzt_umfragen(d)
        assert d["ebenen"][0]["umfragen"]["rows"] == self.ROWS

    def test_laesst_ein_vorlaeufiges_ergebnis_unberuehrt(self):
        d = {"ebenen": [self._ebene(self.ROWS, {"fdp": 2.5, "datum": "2026-09-20", "vorlaeufig": True})]}
        update.ergebnis_ersetzt_umfragen(d)
        assert d["ebenen"][0]["umfragen"]["rows"] == self.ROWS

    def test_ist_wiederholbar_ohne_erneute_meldung(self, capsys):
        d = {"ebenen": [self._ebene(self.ROWS, {"fdp": 2.6, "datum": "2026-09-06"})]}
        update.ergebnis_ersetzt_umfragen(d)
        capsys.readouterr()
        update.ergebnis_ersetzt_umfragen(d)          # zweiter Lauf: nichts mehr zu tun
        assert capsys.readouterr().out == ""
