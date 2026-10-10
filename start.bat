@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv python -m venv .venv
call .venv\Scripts\activate
pip install -q -r requirements.txt
cd server
start "" http://localhost:8000/qr
uvicorn main:app --host 0.0.0.0 --port 8000
pause
