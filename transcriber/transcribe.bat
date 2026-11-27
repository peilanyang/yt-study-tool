@echo off
rem Keep this file ASCII-only: cmd.exe mis-parses UTF-8 (Chinese) text in .bat files.
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set "HERE=%~dp0"
title YouTube Subtitle Tool
if exist "%HERE%.venv\Scripts\python.exe" goto run
echo Not installed yet - running install.bat first...
echo.
call "%HERE%install.bat"
if not exist "%HERE%.venv\Scripts\python.exe" exit /b 1
cls

:run
set "PATH=%PATH%;%USERPROFILE%\.deno\bin;%LOCALAPPDATA%\Microsoft\WinGet\Links"
"%HERE%.venv\Scripts\python.exe" "%HERE%transcribe.py" %*
echo.
pause
