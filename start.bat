@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem 啟動學習工具：本機伺服器只限 127.0.0.1、只提供 app 資料夾，固定埠 8765。
set PYTHONIOENCODING=utf-8
where py >nul 2>nul && (set "PY=py -3") || (set "PY=python")
%PY% --version >nul 2>nul || (echo 找不到 Python，請先到 https://www.python.org 安裝，安裝時勾選 Add python.exe to PATH。& pause & exit /b 1)
%PY% scripts\serve.py
pause
