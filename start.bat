@echo off
rem Keep this file ASCII-only: cmd.exe mis-parses UTF-8 (Chinese) text in .bat files.
rem Starts the study tool: local server on 127.0.0.1:8765, serving the app folder only.
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto nopython
%PY% scripts\serve.py
pause
exit /b

:nopython
echo [ERROR] Python not found. Please install it from https://www.python.org/downloads/
echo         (check "Add python.exe to PATH"), then run start.bat again.
pause
exit /b 1
