@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 安裝 YouTube 字幕小程式
echo ==== 安裝 YouTube 字幕小程式（只需執行一次；之後想更新 yt-dlp 也可以再執行）====
echo.
where py >nul 2>nul && (set "PY=py -3") || (set "PY=python")
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 需要 Python 3.11 以上。請到 https://www.python.org/downloads/ 下載安裝，安裝時勾選 Add python.exe to PATH，再重新執行本檔。
  %PY% --version 2>nul
  pause & exit /b 1
)
for /f "delims=" %%v in ('%PY% --version') do echo 1/4 已找到 %%v
if not exist ".venv\Scripts\python.exe" (
  echo 2/4 建立獨立環境 .venv（不影響電腦上其他 Python 程式）…
  %PY% -m venv .venv || (echo [錯誤] 建立 .venv 失敗 & pause & exit /b 1)
) else (
  echo 2/4 已有 .venv，略過
)
echo 3/4 安裝套件（yt-dlp、faster-whisper、OpenCC），約需數分鐘…
".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet
".venv\Scripts\python.exe" -m pip install -r requirements.txt --quiet || (echo [錯誤] 套件安裝失敗，請確認網路後重新執行 & pause & exit /b 1)
echo 4/4 檢查 Deno（yt-dlp 下載 YouTube 需要）…
where deno >nul 2>nul && goto deno_ok
if exist "%USERPROFILE%\.deno\bin\deno.exe" goto deno_ok
where winget >nul 2>nul || (echo [提醒] 找不到 winget，請到 https://deno.com 手動安裝 Deno。 & goto done)
winget install --id DenoLand.Deno -e --silent --accept-source-agreements --accept-package-agreements
:deno_ok
echo     Deno 已就緒
:done
echo.
echo ==== 安裝完成！之後雙擊 transcribe.bat 就能使用。====
pause
