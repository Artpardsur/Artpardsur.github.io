@echo off
title Redaktor sayta Pardus
cd /d "%~dp0.."
where python >nul 2>nul
if errorlevel 1 (
  echo Python ne nayden. Postav Python s python.org, galochka "Add python.exe to PATH".
  pause
  exit /b 1
)
echo.
echo   Redaktor otkroetsya v brauzere sam.
echo   Eto okno ne zakryvay - v nem rabotaet redaktor.
echo.
python tools/admin.py
pause
