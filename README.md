# YouTube 教學影片學習工具

貼上 YouTube 教學影片網址，取得逐字稿（標點、分段、講者、時間），邊看邊截圖、記筆記、標註，最後整理成可編輯的整篇文章並匯出 Word / PDF。

目前階段：**2 開發**（文件已於 2026-11-26 定稿）。

## 文件

| 文件 | Markdown | Word |
| --- | --- | --- |
| 需求規格 | [docs/01-需求規格.md](docs/01-需求規格.md) | docs/word/01-需求規格.docx |
| 系統架構與品質規範 | [docs/02-系統架構與品質規範.md](docs/02-系統架構與品質規範.md) | docs/word/02-系統架構與品質規範.docx |
| 資安規範 | [docs/03-資安規範.md](docs/03-資安規範.md) | docs/word/03-資安規範.docx |
| 專案管理 | [docs/04-專案管理.md](docs/04-專案管理.md) | docs/word/04-專案管理.docx |
| Git 版本管理規範 | [docs/05-Git版本管理規範.md](docs/05-Git版本管理規範.md) | docs/word/05-Git版本管理規範.docx |
| 交接檔（給新對話） | [docs/HANDOFF.md](docs/HANDOFF.md) | |

文件正本在 Claude Docs（線上編輯、留言），每次修改後重新匯出到 `docs/`。

## 開啟工具

1. 電腦需有 Python（https://www.python.org ，安裝時勾選 Add python.exe to PATH）。
2. 雙擊專案資料夾的 `start.bat`，瀏覽器會自動開啟 http://localhost:8765/ 。
3. 使用期間不要關閉 `start.bat` 的黑色視窗。

請用電腦版 Chrome 或 Edge。直接雙擊 `app/index.html` 無法播放 YouTube（錯誤 153）。

## 字幕小程式（Windows）

在 `transcriber/`：有字幕的影片直接抓字幕，沒有字幕就在電腦上語音轉文字，輸出 `.srt` 給學習工具自動帶入。

1. 第一次：雙擊 `transcriber\install.bat`（需 Python 3.11 以上，約 10 分鐘）。
2. 之後：在學習工具按「產生逐字稿」（網址會自動複製）→ 雙擊 `transcriber\transcribe.bat` → 按 Enter。

詳細說明見 `transcriber/使用說明.txt`。

## 開發

- 程式在 `app/`（原生 ES Modules，不需建置）。
- 單元測試：`node --test tests/js/*.test.mjs`、`python -m pytest tests/py`
- 分支、Commit、版本規則見 `docs/05-Git版本管理規範.md`。

## 舊版

- `legacy/yt-study-v1.html`：v1 單一 HTML 工具，保留參考，不再更新。

## 授權與使用提醒

僅供個人學習使用。下載 YouTube 影音可能違反 YouTube 使用條款，請自行判斷。
