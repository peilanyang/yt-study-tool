@echo off
rem Keep this file ASCII-only: cmd.exe mis-parses UTF-8 (Chinese) text in .bat files.
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
title YouTube Subtitle Tool - Install
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto nopython
%PY% "%~dp0install.py"
pause
exit /b

:nopython
echo [ERROR] Python not found. Please install Python 3.11+ from https://www.python.org/downloads/
echo         (check "Add python.exe to PATH"), then run install.bat again.
pause
exit /b 1
