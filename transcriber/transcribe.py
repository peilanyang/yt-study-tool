"""YouTube 字幕小程式（F7-a）。

流程：YouTube 網址 → 先抓現成字幕（人工字幕優先，其次自動字幕）→ 沒有字幕才下載音訊用 faster-whisper 轉文字
→ 中文轉繁體 → 輸出 output/<標題> [<影片ID>].srt；影片有作者章節時另存 .chapters.json。
本機影音檔：直接語音轉文字。

用法：
  transcribe.bat                       讀剪貼簿裡的網址，或請你貼上
  transcribe.bat <網址或檔案> ...       可一次多個；可以把檔案拖到 transcribe.bat 上
選項：--asr 強制語音辨識  --lang auto|en|zh  --model fast|accurate  --keep-audio  --no-open
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

# 下載模型時的英文警告對使用者沒有幫助（Windows 不支援 symlink、未登入 HF），先關掉。
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_VERBOSITY", "error")
# xet 下載在部分網路會卡住且不顯示進度，改用一般 HTTPS（可續傳）。
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
import warnings  # noqa: E402
warnings.filterwarnings("ignore", module="huggingface_hub")

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "output"
AUDIO_DIR = OUTPUT / "_audio"
MODELS = {"fast": "small", "accurate": "large-v3-turbo"}
YT_RE = re.compile(r"(?:v=|youtu\.be/|shorts/|embed/|live/)([\w-]{11})")
MAX_NAME = 80


# ---------- 純函式（有單元測試） ----------

def youtube_id(text: str) -> str | None:
    """從網址取出 11 碼影片 ID。"""
    text = (text or "").strip()
    if re.fullmatch(r"[\w-]{11}", text):
        return text
    m = YT_RE.search(text)
    return m.group(1) if m else None


def is_playlist(url: str) -> bool:
    return "list=" in url and "watch?v=" not in url and "youtu.be/" not in url


def safe_name(name: str, limit: int = MAX_NAME) -> str:
    """Windows 不允許的字元換成底線，去掉結尾的點與空白。"""
    name = re.sub(r'[\\/:*?"<>|\r\n\t]', "_", name or "untitled").strip().rstrip(". ")
    return (name or "untitled")[:limit]


def output_stem(title: str, video_id: str) -> str:
    return f"{safe_name(title)} [{video_id}]"


def lang_base(code: str) -> str:
    return (code or "").split("-")[0].lower()


def pick_track(info: dict, prefer: str | None = None) -> tuple[str, str] | None:
    """選字幕軌，回傳 (種類, 語言代碼)。種類為 manual 或 auto。

    人工字幕優先；語言優先順序：指定語言 → 影片原始語言 → 英文 → 中文 → 任一。
    自動字幕只取原始語言那一軌（其他是 YouTube 機器翻譯，不用）。
    """
    manual = {k: v for k, v in (info.get("subtitles") or {}).items() if k != "live_chat" and v}
    auto = {k: v for k, v in (info.get("automatic_captions") or {}).items() if v}
    original = lang_base(info.get("language") or "")
    order = [x for x in (prefer, original, "en", "zh") if x]

    def find(keys, want):
        for k in keys:
            if lang_base(k) == want:
                return k
        return None

    for want in order:
        k = find(manual, want)
        if k:
            return ("manual", k)
    if manual:
        return ("manual", sorted(manual)[0])
    # 自動字幕：原始語言的 ASR 軌，代碼通常是 "en" 或 "en-orig"
    for want in [original or prefer or "en"]:
        for cand in (f"{want}-orig", want):
            if cand in auto:
                return ("auto", cand)
        k = find(auto, want)
        if k:
            return ("auto", k)
    return None


def track_url(entries: list[dict]) -> str | None:
    for fmt in ("vtt", "srv1", "json3"):
        for e in entries:
            if e.get("ext") == fmt and e.get("url"):
                return e["url"] if fmt == "vtt" else None
    return None


_TS = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})")


def _sec(s: str) -> float:
    m = _TS.match(s.strip())
    if not m:
        raise ValueError(s)
    h, mnt, sec, ms = m.groups()
    return int(h or 0) * 3600 + int(mnt) * 60 + int(sec) + int(ms) / 1000


def parse_vtt(text: str) -> list[tuple[float, float, str]]:
    """VTT → [(開始, 結束, 文字)]。去掉標籤，並處理 YouTube 自動字幕的「滾動重複」。"""
    cues = []
    blocks = re.split(r"\r?\n\r?\n", text.replace("﻿", ""))
    for b in blocks:
        lines = [l for l in b.splitlines() if l.strip()]
        idx = next((i for i, l in enumerate(lines) if "-->" in l), None)
        if idx is None:
            continue
        start_s, end_s = [x.strip().split(" ")[0] for x in lines[idx].split("-->")]
        try:
            start, end = _sec(start_s), _sec(end_s)
        except ValueError:
            continue
        body = [re.sub(r"<[^>]+>", "", l).strip() for l in lines[idx + 1:]]
        body = [l for l in body if l]
        if body:
            cues.append([start, end, body])
    out: list[tuple[float, float, str]] = []
    prev_lines: list[str] = []
    for start, end, body in cues:
        # 自動字幕每個 cue 會重複上一行：只保留新出現的行
        new = [l for l in body if l not in prev_lines]
        prev_lines = body
        if not new or end - start < 0.05:
            continue
        out.append((start, end, " ".join(new)))
    return out


def fmt_srt_time(t: float) -> str:
    ms = int(round(max(t, 0) * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(entries: list[tuple[float, float, str]]) -> str:
    parts = []
    for i, (start, end, text) in enumerate(entries, 1):
        parts.append(f"{i}\n{fmt_srt_time(start)} --> {fmt_srt_time(max(end, start + 0.5))}\n{text.strip()}\n")
    return "\n".join(parts)


def chapters_json(info: dict) -> list[dict]:
    """作者章節 → [{"t": 秒數, "title": 標題}]"""
    out = []
    for c in info.get("chapters") or []:
        title = str(c.get("title") or "").strip()
        if title:
            out.append({"t": round(float(c.get("start_time") or 0), 1), "title": title[:200]})
    return out


def default_model(lang: str | None) -> str:
    """中文用準確模式（小模型中文錯字多，風險 R7），其他用快速模式。"""
    return "accurate" if lang_base(lang or "") == "zh" else "fast"


# ---------- 與外部互動 ----------

def say(msg: str = "") -> None:
    print(msg, flush=True)


def read_clipboard() -> str:
    if os.name != "nt":
        return ""
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-Command", "Get-Clipboard -Raw"],
                           capture_output=True, text=True, encoding="utf-8", timeout=5)
        return r.stdout or ""
    except Exception:
        return ""


def to_traditional(text: str) -> str:
    try:
        from opencc import OpenCC
    except ImportError:
        return text
    return OpenCC("s2twp").convert(text)


def ydl_base() -> dict:
    return {"quiet": True, "no_warnings": True, "noprogress": True, "noplaylist": True, "cookiefile": None}


def fetch_info(url: str) -> dict:
    import yt_dlp
    with yt_dlp.YoutubeDL({**ydl_base(), "skip_download": True}) as ydl:
        return ydl.extract_info(url, download=False)


def playlist_urls(url: str) -> list[str]:
    import yt_dlp
    with yt_dlp.YoutubeDL({**ydl_base(), "noplaylist": False, "extract_flat": True}) as ydl:
        info = ydl.extract_info(url, download=False)
    return [f"https://www.youtube.com/watch?v={e['id']}" for e in info.get("entries") or [] if e and e.get("id")]


def download_text(url: str) -> str:
    import yt_dlp
    with yt_dlp.YoutubeDL(ydl_base()) as ydl:
        return ydl.urlopen(url).read().decode("utf-8", "ignore")


def disable_quick_edit() -> None:
    """Windows 主控台的「快速編輯」：在黑視窗點一下就會暫停程式，看起來像當掉。關掉它。"""
    if os.name != "nt":
        return
    try:
        import ctypes
        k = ctypes.windll.kernel32
        h = k.GetStdHandle(-10)  # STD_INPUT_HANDLE
        mode = ctypes.c_uint()
        if k.GetConsoleMode(h, ctypes.byref(mode)):
            k.SetConsoleMode(h, (mode.value & ~0x0040) | 0x0080)  # 去掉 QUICK_EDIT，保留 EXTENDED_FLAGS
    except Exception:
        pass


def dir_mb(path: Path) -> float:
    total = 0
    for p in path.rglob("*"):
        try:
            if p.is_file():
                total += p.stat().st_size
        except OSError:
            pass
    return total / 1048576


class Heartbeat:
    """長時間沒有輸出時，每 5 秒更新一行「已經過 X 分」，讓使用者知道還在跑。"""

    def __init__(self, label: str, watch: Path | None = None):
        self.label, self.watch = label, watch

    def __enter__(self):
        import threading
        self.stop = threading.Event()
        self.t0 = time.time()

        def loop():
            while not self.stop.wait(5):
                s = int(time.time() - self.t0)
                extra = f"，已下載 {dir_mb(self.watch):,.0f} MB" if self.watch and self.watch.exists() else ""
                print(f"\r  {self.label}… 已經過 {s // 60} 分 {s % 60:02d} 秒{extra}   ", end="", flush=True)

        self.th = threading.Thread(target=loop, daemon=True)
        self.th.start()
        return self

    def __exit__(self, *exc):
        self.stop.set()
        self.th.join()
        if time.time() - self.t0 >= 5:
            print()


def hf_cache() -> Path:
    base = os.environ.get("HF_HUB_CACHE") or os.environ.get("HF_HOME")
    return Path(base) if base else Path.home() / ".cache" / "huggingface" / "hub"


def download_audio(url: str, video_id: str) -> Path:
    import yt_dlp
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    opts = {**ydl_base(), "format": "bestaudio[ext=m4a]/bestaudio/best", "outtmpl": str(AUDIO_DIR / f"{video_id}.%(ext)s"),
            "noprogress": False, "quiet": False}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return Path(ydl.prepare_filename(info))


def transcribe_audio(path: Path, lang: str | None, model_key: str, duration: float | None = None) -> tuple[list, str]:
    from faster_whisper import WhisperModel
    name = MODELS[model_key]
    say(f"載入語音辨識模型（{'準確' if model_key == 'accurate' else '快速'}模式：{name}）。第一次使用會先下載模型，請稍候…")
    with Heartbeat("下載／載入模型", hf_cache()):
        model = WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
    say("  模型就緒，開始辨識（先分析整段聲音，第一行進度可能要等 1～2 分鐘）")
    prompt = "以下是繁體中文的句子，包含標點符號。" if lang_base(lang or "") == "zh" else None
    with Heartbeat("分析聲音"):
        segments, info = model.transcribe(str(path), language=lang or None, vad_filter=True, beam_size=5, initial_prompt=prompt)
        it = iter(segments)
        first = next(it, None)
    total = duration or info.duration or 0
    out, t0 = [], time.time()
    import itertools
    for s in itertools.chain([first] if first else [], it):
        out.append((s.start, s.end, s.text.strip()))
        if total:
            pct = min(100, s.end / total * 100)
            spent = time.time() - t0
            left = spent / max(pct, 1) * (100 - pct)
            print(f"\r  辨識中 {pct:5.1f}%　預估剩餘 {int(left // 60)} 分 {int(left % 60)} 秒   ", end="", flush=True)
    print()
    return out, info.language or (lang or "")


def write_outputs(stem: str, entries: list, chapters: list[dict], lang: str) -> Path:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if lang_base(lang) == "zh":
        entries = [(a, b, to_traditional(t)) for a, b, t in entries]
        chapters = [{**c, "title": to_traditional(c["title"])} for c in chapters]
    srt = OUTPUT / f"{stem}.srt"
    srt.write_text(to_srt(entries), encoding="utf-8")
    if chapters:
        (OUTPUT / f"{stem}.chapters.json").write_text(json.dumps(chapters, ensure_ascii=False, indent=1), encoding="utf-8")
    return srt


def ask_model(lang: str | None, given: str | None) -> str:
    if given:
        return given
    d = default_model(lang)
    say("這部影片沒有字幕，要用語音轉文字。請選模式：")
    say(f"  1 快速（約影片長度的 1/3 時間，英文夠用）{'  ← 預設' if d == 'fast' else ''}")
    say(f"  2 準確（約與影片等長，中文建議）{'  ← 預設' if d == 'accurate' else ''}")
    a = input("輸入 1 或 2，直接按 Enter 用預設：").strip()
    return {"1": "fast", "2": "accurate"}.get(a, d)


def ask_lang(given: str | None) -> str | None:
    if given:
        return None if given == "auto" else given
    a = input("影片主要語言？ 1 中文　2 英文　Enter 自動判斷：").strip()
    return {"1": "zh", "2": "en"}.get(a)


def process_url(url: str, args) -> Path | None:
    vid = youtube_id(url)
    say(f"\n▶ 讀取影片資訊：{url}")
    try:
        info = fetch_info(url)
    except Exception as e:
        say(f"  ✗ 讀取失敗：{e}")
        say("  可能原因：網址錯誤、影片不公開、或需要更新 yt-dlp（請再執行一次 install.bat）。")
        return None
    vid = info.get("id") or vid
    title = info.get("title") or vid
    stem = output_stem(title, vid)
    chapters = chapters_json(info)
    say(f"  標題：{title}")
    if chapters:
        say(f"  作者章節：{len(chapters)} 個")
    track = None if args.asr else pick_track(info, args.lang if args.lang not in (None, "auto") else None)
    if track:
        kind, code = track
        entries_src = (info.get("subtitles") if kind == "manual" else info.get("automatic_captions"))[code]
        url_vtt = track_url(entries_src)
        if url_vtt:
            say(f"  找到{'人工' if kind == 'manual' else '自動'}字幕（{code}），下載中…")
            try:
                entries = parse_vtt(download_text(url_vtt))
                if entries:
                    out = write_outputs(stem, entries, chapters, code)
                    say(f"  ✓ 完成：{out.name}（{len(entries)} 行）")
                    return out
            except Exception as e:
                say(f"  字幕下載失敗（{e}），改用語音轉文字。")
    say("  沒有可用的字幕，改用語音轉文字。")
    lang = ask_lang(args.lang)
    model_key = ask_model(lang or info.get("language"), args.model)
    try:
        audio = download_audio(url, vid)
    except Exception as e:
        say(f"  ✗ 音訊下載失敗：{e}")
        say("  請確認已執行 install.bat（含 Deno），或再執行一次 install.bat 更新 yt-dlp。")
        return None
    try:
        entries, detected = transcribe_audio(audio, lang, model_key, info.get("duration"))
    finally:
        if not args.keep_audio:
            audio.unlink(missing_ok=True)
    out = write_outputs(stem, entries, chapters, lang or detected)
    say(f"  ✓ 完成：{out.name}（{len(entries)} 行）")
    return out


def process_file(path: Path, args) -> Path | None:
    say(f"\n▶ 本機檔案：{path.name}")
    if not path.is_file():
        say("  ✗ 找不到檔案")
        return None
    lang = ask_lang(args.lang)
    model_key = ask_model(lang, args.model)
    try:
        entries, detected = transcribe_audio(path, lang, model_key)
    except Exception as e:
        say(f"  ✗ 無法辨識這個檔案：{e}")
        return None
    out = write_outputs(safe_name(path.stem), entries, [], lang or detected)
    say(f"  ✓ 完成：{out.name}（{len(entries)} 行）")
    return out


def collect_inputs(raw: list[str]) -> list[str]:
    if raw:
        return raw
    clip = read_clipboard().strip()
    if youtube_id(clip) and "\n" not in clip:
        a = input(f"剪貼簿裡有影片網址：\n  {clip}\n要處理這部影片嗎？（Enter = 是，n = 否）").strip().lower()
        if a != "n":
            return [clip]
    say("請貼上 YouTube 網址（可多個，用空白分隔），或把影音檔拖到 transcribe.bat 上：")
    return input("> ").split()


def main(argv: list[str] | None = None) -> int:
    disable_quick_edit()
    p = argparse.ArgumentParser(description="YouTube 字幕小程式")
    p.add_argument("inputs", nargs="*")
    p.add_argument("--asr", action="store_true", help="不抓字幕，直接語音轉文字")
    p.add_argument("--lang", choices=["auto", "en", "zh"])
    p.add_argument("--model", choices=["fast", "accurate"])
    p.add_argument("--keep-audio", action="store_true")
    p.add_argument("--no-open", action="store_true")
    args = p.parse_args(argv)

    items = collect_inputs(args.inputs)
    if not items:
        say("沒有要處理的項目。")
        return 1
    done: list[Path] = []
    for item in items:
        try:
            if youtube_id(item) or "youtube.com" in item:
                urls = playlist_urls(item) if is_playlist(item) else [item]
                if len(urls) > 1:
                    say(f"\n播放清單共 {len(urls)} 部影片")
                for u in urls:
                    r = process_url(u, args)
                    if r:
                        done.append(r)
            else:
                r = process_file(Path(item.strip('"')), args)
                if r:
                    done.append(r)
        except KeyboardInterrupt:
            say("\n已取消。")
            break
    say(f"\n完成 {len(done)} / {len(items)} 項。字幕檔在：{OUTPUT}")
    if done:
        say("回到學習工具，字幕會自動帶入（或在「產生逐字稿」步驟 1 上傳 .srt）。")
        if os.name == "nt" and not args.no_open:
            os.startfile(OUTPUT)  # noqa: S606 只開啟本機輸出資料夾
    return 0 if done else 1


if __name__ == "__main__":
    sys.exit(main())
