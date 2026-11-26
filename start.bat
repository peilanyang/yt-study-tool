@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem 啟動本機伺服器（只限本機 127.0.0.1，只提供 app 資料夾），並開啟學習工具。
where py >nul 2>nul && (set "PY=py -3") || (set "PY=python")
%PY% --version >nul 2>nul || (echo 找不到 Python，請先到 https://www.python.org 安裝，安裝時勾選 Add python.exe to PATH。& pause & exit /b 1)
echo 學習工具網址：http://localhost:8000/
echo 使用期間請不要關閉這個視窗；要結束時直接關掉即可。
start "" http://localhost:8000/
%PY% -m http.server 8000 --bind 127.0.0.1 --directory app
pause
