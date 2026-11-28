# 專案交接檔（給下一個 Claude 對話）

最後更新：2026-11-28（台北時間）

開新對話時請先讀完這份檔案，再接著工作。

## 1. 專案一句話

YouTube 教學影片學習工具：貼網址 → 取得逐字稿（標點、分段、講者、時間）→ 邊看邊截圖、記筆記、標註 → 整篇文章可編輯 → 匯出 Word / PDF。使用者是個人學習者，Windows 電腦、無獨立顯示卡，影片多為 15–30 分鐘中英文。

## 2. 目前進度

- 階段：**2 開發**。關卡 G1（文件定稿）已於 2026-11-26 通過。
- 仍待使用者確認：
  - 需求規格第 9 節 NFR-02、NFR-07 的「建議值」（可在驗收時依實測調整）。
  - **播放速度文件與程式不一致**：需求規格 F11、A12、第 11 節寫 0.25 / 0.5 / 1 / 1.5 / 2；程式（`app/js/model.js` 的 `SPEEDS`）依使用者實測回饋已改為 0.5 / 0.75 / 1 / 1.5 / 2。需請使用者確認後，回頭更新 Claude Docs 正本並重新匯出 `docs/`。
- Git：完成。GitHub 公開儲存庫 https://github.com/peilanyang/yt-study-tool ；使用者專案資料夾已是它的本機複本（main 追蹤 origin/main）。
- 程式碼：T04 完成並合併到 main（2026-11-26，使用者 Windows 實測通過）。T05（Windows 小程式）已完成並合併（2026-11-28，使用者在 Windows 實測：中文無字幕影片語音轉文字、自動帶入、匯入後點時間跳轉皆 OK）。T14（章節）已完成並合併（2026-11-28，使用者以真實 Claude 回覆驗收 OK）。下一步候選：F12 整篇文章（可編輯、以章節為小標題）、T07 截圖標註、T08 Word/PDF 匯出、T13 雲端同步。

T05 實測學到的事：.bat 只能用 ASCII（pre-commit 會擋）；av 鎖 18（19 與 faster-whisper 1.2.1 不相容）；本機伺服器送 no-cache；模型第一次下載約 1.6GB、慢網路要 30 分鐘以上。
- 使用者實測回饋已處理：8000 埠被佔用改 8765（scripts/serve.py）、大畫面/全螢幕改善畫質、速度改 0.5/0.75/1/1.5/2、點影片後快捷鍵可用。
- 已知：很多中文影片沒有 YouTube 字幕（字幕燒在畫面上），只能靠 T05 語音轉文字。
- v1 舊版工具：`legacy/yt-study-v1.html`（單一 HTML，可用但不再擴充）。

## 3. 重要連結與位置

| 項目 | 位置 |
| --- | --- |
| 專案資料夾 | `C:\Users\USER\Desktop\Claude\影片教學工具` |
| 文件集正本（Claude Docs，5 個分頁） | https://claude.ai/artifact/Mq82x1bgUWHZjfcG62ucqp |
| 文件匯出版 | `docs/*.md`（圖在 `docs/images/`）、`docs/word/*.docx` |
| UI Mockup（Design 畫布，6 個畫面） | https://claude.ai/artifact/9eoHq6FavFacooKHupqHFh |
| GitHub | https://github.com/peilanyang/yt-study-tool （公開）；GitHub Pages **尚未開啟**（2026-11-28 檢查 https://peilanyang.github.io/yt-study-tool/ 回 404） |
| 目前開啟方式 | 專案資料夾的 `start.bat` → 本機伺服器 8765 埠（`scripts/serve.py`） |

文件集分頁：需求規格、系統架構與品質規範、資安規範、專案管理、Git 版本管理規範。

## 4. 已確認的決定（摘要，完整見需求規格第 11 節）

- 逐字稿：**半自動、免費**。Windows 小程式先用 yt-dlp 抓 YouTube 字幕，沒有才用 faster-whisper 轉語音；再「複製提示詞」貼到 Claude 對話整理，結果貼回工具。不做 API 全自動（API 金鑰為選用）。
- 貼網址時二選一：「產生逐字稿」或「只看影片」；只看影片的之後可隨時補產生。
- 貼網址時先偵測有無字幕（有 / 沒有 / 無法判斷），沒有字幕時畫面引導三種做法。
- 逐字稿保留原文，按「翻譯成中文」才翻譯（同樣用複製提示詞）。
- 「整篇文章」：依主題自動分段、每段有時間；**可編輯**（改字、刪除、合併/切分段落、插入「我的補充」），另存一份不動原始逐字稿。
- 截圖：每張附筆記框，截圖後立即可輸入；「截圖後暫停影片」預設勾選。
- 截圖標註：方框、圈圈、線條、箭頭、文字、標號；5 色、3 種粗細；不做馬賽克。
- 播放速度：文件寫 0.25 / 0.5 / 1 / 1.5 / 2 倍；實作已改 0.5 / 0.75 / 1 / 1.5 / 2（待確認，見第 2 節）。
- 播放清單：新增 / 刪除 / 改名清單與影片；內建不可刪除的「未分類」預設清單。
- 頁籤順序：逐字稿、截圖、筆記。
- 雲端同步：透過 OneDrive / Google 雲端硬碟**資料夾**（File System Access API），多台 Windows 電腦；不需雲端帳號設定。
- 使用者 2 人各用各的電腦，內容不共享，工具不做登入。
- 文件正本 = 線上 Claude Docs；每次修改後重新匯出到 `docs/`。

## 5. 使用者的工作偏好

- 全程繁體中文（台灣用語）。
- **文件驅動開發**：任何變更先改文件、使用者確認後才寫程式；照專案管理第 5 節的變更流程。
- 文件**盡量用圖**（架構圖、流程圖）。
- 先出 Mockup 給使用者確認再開發。
- 所有產出放在專案資料夾。

## 6. 下一步

1. 請使用者選下一個任務：F12 整篇文章、T07 截圖標註、T08 Word/PDF 匯出、T13 雲端同步。照工作偏好：先改文件／出 Mockup、使用者確認後才寫程式；每個功能一條 `feature/` 分支。
2. 處理播放速度文件與程式不一致（見第 2 節）。
3. GitHub Pages：`app/` 已存在，可請使用者在 GitHub 儲存庫 Settings → Pages → Deploy from a branch → main / (root) 開啟（Claude 無法用 API 開）。開啟前一律用 `start.bat`。
4. commit 作者：`peilanyang <peilanyang@users.noreply.github.com>`；已啟用 `scripts/hooks/pre-commit` 金鑰掃描（`git config core.hooksPath scripts/hooks`）。

## 7. 技術備忘（給 Claude）

- 使用者電腦要透過 Claude 桌面版連線，並授權存取專案資料夾，才能讀寫檔案。
- 匯出文件的方法：Claude Docs `export` 用 `format: docx`、`pictures: fit`（結果存成檔案）→ 解 base64 → `pandoc -t gfm --extract-media` 轉 Markdown；圖片資料夾用英文名（`01-requirements` 等），否則路徑亂碼。
- 文件集分頁 file id：需求規格 `885e1541-c0e2`、架構 `5135d156-4b34`、資安 `f10f467c-268f`、專案管理 `15faa16f-ad15`、Git `2845ff0b-ff1c`。
- Git 在連線資料夾內需先取得「刪除權限」，否則 git 的 lock 檔會出錯。
- 同步方式：在雲端工作區 `/home/claude/yt-study-tool` 開發並 push，再到使用者資料夾 `git pull`。不要用 device_commit_files 傳 PNG（輸出儲存區會重新編碼圖片，造成 git 顯示修改）。
