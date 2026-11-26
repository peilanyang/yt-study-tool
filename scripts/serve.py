"""本機伺服器：只綁 127.0.0.1、只提供 app/ 資料夾（資安規範 3.5），並開啟瀏覽器。

固定使用同一個埠：瀏覽器的資料（筆記、截圖）是依「網址＋埠」分開存的，換埠會看起來像資料不見。
"""
import functools
import http.server
import socket
import sys
import urllib.request
import webbrowser
from pathlib import Path

PORT = 8765
HOST = "127.0.0.1"
APP_DIR = Path(__file__).resolve().parent.parent / "app"
URL = f"http://localhost:{PORT}/"
MARK = "影片教學工具"


class Handler(http.server.SimpleHTTPRequestHandler):
    """Windows 登錄檔有時把 .js 對應成 text/plain，ES Modules 會載入失敗，所以固定 MIME。"""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json",
        ".svg": "image/svg+xml",
    }

    def log_message(self, format, *args):  # 不在視窗洗版
        pass


def port_busy() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((HOST, PORT)) == 0


def is_our_server() -> bool:
    try:
        with urllib.request.urlopen(URL, timeout=2) as r:
            return MARK in r.read(4096).decode("utf-8", "ignore")
    except Exception:
        return False


def main() -> int:
    if not (APP_DIR / "index.html").exists():
        print(f"找不到 {APP_DIR / 'index.html'}，請確認 start.bat 放在專案資料夾最上層。")
        return 1
    if port_busy():
        if is_our_server():
            print("學習工具已經在執行中，直接開啟瀏覽器。")
            webbrowser.open(URL)
            return 0
        print(f"埠 {PORT} 被其他程式佔用，學習工具無法啟動。")
        print("請關閉佔用的程式後再執行 start.bat。")
        print(f"查看是哪個程式：在命令提示字元輸入  netstat -ano | findstr :{PORT}")
        return 1
    handler = functools.partial(Handler, directory=str(APP_DIR))
    try:
        server = http.server.ThreadingHTTPServer((HOST, PORT), handler)
    except OSError as e:
        print(f"無法啟動伺服器：{e}")
        return 1
    print(f"學習工具網址：{URL}")
    print("使用期間請不要關閉這個視窗；要結束時直接關掉即可。")
    webbrowser.open(URL)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
