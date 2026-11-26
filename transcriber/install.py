"""安裝 YouTube 字幕小程式：建立 .venv、安裝套件、檢查 Deno。

由 install.bat 用系統的 Python 執行。所有中文訊息都放在這裡，
因為 Windows 的 .bat 檔遇到中文（UTF-8）容易把指令切壞。
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENV_PY = HERE / ".venv" / "Scripts" / "python.exe"


def fail(msg):
    print(f"\n[錯誤] {msg}")
    sys.exit(1)


def run(args, what):
    r = subprocess.run(args)
    if r.returncode != 0:
        fail(what)


def find_deno():
    if shutil.which("deno"):
        return True
    home = Path(os.environ.get("USERPROFILE", Path.home()))
    links = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Links" / "deno.exe"
    return (home / ".deno" / "bin" / "deno.exe").exists() or links.exists()


def main():
    print("==== 安裝 YouTube 字幕小程式（只需執行一次；想更新 yt-dlp 也可以再執行）====\n")
    if sys.version_info < (3, 11):
        fail(f"需要 Python 3.11 以上，目前是 {sys.version.split()[0]}。\n"
             "請到 https://www.python.org/downloads/ 下載安裝（勾選 Add python.exe to PATH），再重新執行 install.bat。")
    print(f"1/4 已找到 Python {sys.version.split()[0]}")

    if VENV_PY.exists():
        print("2/4 已有 .venv，略過")
    else:
        print("2/4 建立獨立環境 .venv（不影響電腦上其他 Python 程式）...")
        run([sys.executable, "-m", "venv", str(HERE / ".venv")], "建立 .venv 失敗")

    print("3/4 安裝套件（yt-dlp、faster-whisper、OpenCC），約需數分鐘...")
    run([str(VENV_PY), "-m", "pip", "install", "--upgrade", "pip", "--quiet"], "更新 pip 失敗，請確認網路後重新執行")
    run([str(VENV_PY), "-m", "pip", "install", "-r", str(HERE / "requirements.txt"), "--quiet"],
        "套件安裝失敗，請確認網路後重新執行")

    print("4/4 檢查 Deno（yt-dlp 下載 YouTube 需要）...")
    if find_deno():
        print("    Deno 已就緒")
    elif shutil.which("winget"):
        subprocess.run(["winget", "install", "--id", "DenoLand.Deno", "-e", "--silent",
                        "--accept-source-agreements", "--accept-package-agreements"])
        print("    Deno 已就緒" if find_deno() else "    [提醒] Deno 可能沒裝好，請到 https://deno.com 手動安裝。")
    else:
        print("    [提醒] 找不到 winget，請到 https://deno.com 手動安裝 Deno。")

    print("\n==== 安裝完成！之後雙擊 transcribe.bat 就能使用。====")


if __name__ == "__main__":
    main()
