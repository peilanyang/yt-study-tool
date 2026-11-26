import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "transcriber"))
import transcribe as t  # noqa: E402


def test_youtube_id():
    assert t.youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1") == "dQw4w9WgXcQ"
    assert t.youtube_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert t.youtube_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert t.youtube_id("C:\\videos\\a.mp4") is None


def test_is_playlist():
    assert t.is_playlist("https://www.youtube.com/playlist?list=PL123")
    assert not t.is_playlist("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123")


def test_safe_name_and_stem():
    assert t.safe_name('a/b:c*?"<>|d. ') == "a_b_c______d"
    assert t.safe_name("") == "untitled"
    assert t.output_stem("x" * 200, "dQw4w9WgXcQ") == "x" * 80 + " [dQw4w9WgXcQ]"


def test_pick_track_prefers_manual_in_original_language():
    info = {"language": "en", "subtitles": {"zh-TW": [{}], "en-US": [{}], "live_chat": [{}]}, "automatic_captions": {"en": [{}]}}
    assert t.pick_track(info) == ("manual", "en-US")


def test_pick_track_auto_original_not_translation():
    info = {"language": "zh", "subtitles": {}, "automatic_captions": {"en": [{}], "zh-Hans": [{}], "zh": [{}]}}
    assert t.pick_track(info) == ("auto", "zh")
    info2 = {"language": "en", "subtitles": {}, "automatic_captions": {"en-orig": [{}], "en": [{}], "fr": [{}]}}
    assert t.pick_track(info2) == ("auto", "en-orig")


def test_pick_track_none():
    assert t.pick_track({"subtitles": {}, "automatic_captions": {}}) is None
    assert t.pick_track({}) is None


def test_track_url_only_vtt():
    assert t.track_url([{"ext": "json3", "url": "a"}, {"ext": "vtt", "url": "b"}]) == "b"
    assert t.track_url([{"ext": "srv3", "url": "a"}]) is None


VTT_AUTO = """WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.000 align:start position:0%
hello<00:00:00.500><c> everyone</c>

00:00:02.000 --> 00:00:02.010 align:start position:0%
hello everyone

00:00:02.010 --> 00:00:04.000 align:start position:0%
hello everyone
welcome back
"""


def test_parse_vtt_rolling_auto_captions():
    assert t.parse_vtt(VTT_AUTO) == [(0.0, 2.0, "hello everyone"), (2.01, 4.0, "welcome back")]


def test_parse_vtt_hours_and_bom():
    v = "\ufeffWEBVTT\n\n01:00:01.500 --> 01:00:03.000\nlate line\n"
    assert t.parse_vtt(v) == [(3601.5, 3603.0, "late line")]


def test_srt_format():
    srt = t.to_srt([(0, 1.5, "a"), (3661.25, 3661.3, "b")])
    assert srt.startswith("1\n00:00:00,000 --> 00:00:01,500\na\n")
    assert "2\n01:01:01,250 --> 01:01:01,750\nb" in srt  # 太短的字幕至少 0.5 秒


def test_chapters_json():
    info = {"chapters": [{"start_time": 0, "title": "開場"}, {"start_time": 146.2, "title": "  Anthropic IPO "}, {"start_time": 300, "title": ""}]}
    assert t.chapters_json(info) == [{"t": 0.0, "title": "開場"}, {"t": 146.2, "title": "Anthropic IPO"}]


def test_default_model():
    assert t.default_model("zh-TW") == "accurate"
    assert t.default_model("en") == "fast"
    assert t.default_model(None) == "fast"


def test_write_outputs_traditional(tmp_path, monkeypatch):
    monkeypatch.setattr(t, "OUTPUT", tmp_path)
    out = t.write_outputs("影片 [dQw4w9WgXcQ]", [(0, 1, "软件信息")], [{"t": 0, "title": "视频"}], "zh")
    assert out.read_text(encoding="utf-8").strip().endswith("軟體資訊")
    assert "影片" in (tmp_path / "影片 [dQw4w9WgXcQ].chapters.json").read_text(encoding="utf-8")


def test_write_outputs_english_untouched(tmp_path, monkeypatch):
    monkeypatch.setattr(t, "OUTPUT", tmp_path)
    out = t.write_outputs("v [aaaaaaaaaaa]", [(0, 1, "hello")], [], "en")
    assert "hello" in out.read_text(encoding="utf-8")
    assert not (tmp_path / "v [aaaaaaaaaaa].chapters.json").exists()
