@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set "HERE=%~dp0"
title YouTube 字幕小程式
if not exist "%HERE%.venv\Scripts\python.exe" (
  echo 還沒安裝。請先雙擊同一個資料夾裡的 install.bat。
  pause & exit /b 1
)
set "PATH=%PATH%;%USERPROFILE%\.deno\bin;%LOCALAPPDATA%\Microsoft\WinGet\Links"
"%HERE%.venv\Scripts\python.exe" "%HERE%transcribe.py" %*
echo.
pause
