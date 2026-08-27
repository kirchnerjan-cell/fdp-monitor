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
        d = {"accounts": [], "posts": [], "umfragen": {}, "erstellt": "2026-08-27T10:00"}
        update.save_data(d)
        assert update.load_data() == d

    def test_save_writes_utf8_with_trailing_newline(self, tmp_path, monkeypatch):
        data_file = tmp_path / "data.json"
        monkeypatch.setattr(update, "DATA", str(data_file))
        update.save_data({"autor": "Müller"})
        raw = data_file.read_text(encoding="utf-8")
        assert raw.endswith("\n")
        assert "Müller" in raw
        assert "\\u" not in raw  # ensure_ascii=False: no escape sequences


class TestAddPosts:
    def _inbox(self, tmp_path, *lines):
        p = tmp_path / "posts.txt"
        p.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return p

    def test_skips_already_known_url(self, tmp_path, monkeypatch, capsys):
        url = "https://www.instagram.com/p/ABC123/"
        monkeypatch.setattr(update, "INBOX", str(self._inbox(tmp_path, url)))
        monkeypatch.setattr(update, "fetch_oembed", lambda u: (_ for _ in ()).throw(AssertionError("should not fetch known url")))
        d = {"posts": [{"url": url}], "accounts": []}
        update.add_posts(d)
        assert len(d["posts"]) == 1
        assert "0 neue" in capsys.readouterr().out

    def test_adds_new_post_with_oembed_data(self, tmp_path, monkeypatch):
        url = "https://www.instagram.com/p/NEW123/"
        monkeypatch.setattr(update, "INBOX", str(self._inbox(tmp_path, url)))
        monkeypatch.setattr(update, "THUMBS", str(tmp_path / "thumbs"))
        monkeypatch.setattr(update, "fetch_oembed", lambda u: {
            "author_name": "fdp", "title": "Ein Titel", "thumbnail_url": "https://example.com/t.jpg",
            "html": "<blockquote>...</blockquote>",
        })
        monkeypatch.setattr(update, "get", lambda u, timeout=20: b"fake-image-bytes")
        d = {"posts": [], "accounts": [{"handle": "fdp"}]}
        update.add_posts(d)
        assert len(d["posts"]) == 1
        post = d["posts"][0]
        assert post["id"] == "NEW123"
        assert post["url"] == url
        assert post["autor"] == "fdp"
        assert post["caption"] == "Ein Titel"
        assert post["thumbnail"] == "thumbs/NEW123.jpg"
        assert post["faktencheck"]["status"] == "ungeprüft"

    def test_http_error_from_oembed_is_skipped_not_raised(self, tmp_path, monkeypatch, capsys):
        import urllib.error
        url = "https://www.instagram.com/p/PRIVATE1/"
        monkeypatch.setattr(update, "INBOX", str(self._inbox(tmp_path, url)))

        def raise_http_error(u):
            raise urllib.error.HTTPError(u, 400, "Bad Request", hdrs=None, fp=None)

        monkeypatch.setattr(update, "fetch_oembed", raise_http_error)
        d = {"posts": [], "accounts": []}
        update.add_posts(d)
        assert d["posts"] == []
        assert "oEmbed-Fehler 400" in capsys.readouterr().out

    def test_generic_exception_from_oembed_is_skipped_not_raised(self, tmp_path, monkeypatch):
        url = "https://www.instagram.com/p/BROKEN1/"
        monkeypatch.setattr(update, "INBOX", str(self._inbox(tmp_path, url)))
        monkeypatch.setattr(update, "fetch_oembed", lambda u: (_ for _ in ()).throw(TimeoutError("network down")))
        d = {"posts": [], "accounts": []}
        update.add_posts(d)  # must not raise
        assert d["posts"] == []

    def test_thumbnail_download_failure_falls_back_to_remote_url(self, tmp_path, monkeypatch):
        url = "https://www.instagram.com/p/NOPIC1/"
        monkeypatch.setattr(update, "INBOX", str(self._inbox(tmp_path, url)))
        monkeypatch.setattr(update, "THUMBS", str(tmp_path / "thumbs"))
        monkeypatch.setattr(update, "fetch_oembed", lambda u: {
            "author_name": "fdp", "thumbnail_url": "https://example.com/t.jpg",
        })

        def failing_get(u, timeout=20):
            raise OSError("connection reset")

        monkeypatch.setattr(update, "get", failing_get)
        d = {"posts": [], "accounts": []}
        update.add_posts(d)
        assert d["posts"][0]["thumbnail"] == "https://example.com/t.jpg"

    def test_author_not_in_accounts_still_adds_post(self, tmp_path, monkeypatch, capsys):
        url = "https://www.instagram.com/p/UNKNOWN1/"
        monkeypatch.setattr(update, "INBOX", str(self._inbox(tmp_path, url)))
        monkeypatch.setattr(update, "fetch_oembed", lambda u: {"author_name": "someoneelse"})
        d = {"posts": [], "accounts": [{"handle": "fdp"}]}
        update.add_posts(d)
        assert len(d["posts"]) == 1
        assert "steht nicht in accounts" in capsys.readouterr().out

    def test_no_thumbnail_url_returns_none(self, tmp_path, monkeypatch):
        url = "https://www.instagram.com/p/NOTHUMB1/"
        monkeypatch.setattr(update, "INBOX", str(self._inbox(tmp_path, url)))
        monkeypatch.setattr(update, "fetch_oembed", lambda u: {"author_name": "fdp"})
        d = {"posts": [], "accounts": []}
        update.add_posts(d)
        assert d["posts"][0]["thumbnail"] is None


class TestUpdatePolls:
    def test_success_overwrites_umfragen(self, monkeypatch):
        fake_db = {
            "Database": {"Last_Update": "2026-08-20"},
            "Parties": {"1": {"Shortcut": "FDP"}},
            "Parliaments": {"10": {"Shortcut": "BT", "Name": "Bundestag"}},
            "Institutes": {"5": {"Name": "Forsa"}},
            "Surveys": {"100": {"Parliament_ID": 10, "Institute_ID": 5, "Date": "2026-08-01", "Results": {"1": 4.5}}},
        }
        monkeypatch.setattr(update, "get", lambda url, timeout=20: json.dumps(fake_db).encode("utf-8"))
        d = {"umfragen": {"stand": "old", "bundestag": [{"institut": "Alt"}], "nrw": []}}
        update.update_polls(d)
        assert d["umfragen"]["stand"] == "2026-08-20"
        assert d["umfragen"]["bundestag"] == [{"institut": "Forsa", "datum": "2026-08-01", "fdp": 4.5}]

    def test_network_failure_preserves_old_umfragen(self, monkeypatch, capsys):
        def failing_get(url, timeout=20):
            raise TimeoutError("dawum unreachable")

        monkeypatch.setattr(update, "get", failing_get)
        old = {"stand": "2026-08-01", "bundestag": [{"institut": "Alt"}], "nrw": []}
        d = {"umfragen": dict(old)}
        update.update_polls(d)
        assert d["umfragen"] == old
        assert "nicht erreichbar" in capsys.readouterr().out

    def test_invalid_json_preserves_old_umfragen(self, monkeypatch):
        monkeypatch.setattr(update, "get", lambda url, timeout=20: b"not json")
        old = {"stand": "2026-08-01", "bundestag": [], "nrw": []}
        d = {"umfragen": dict(old)}
        update.update_polls(d)
        assert d["umfragen"] == old
