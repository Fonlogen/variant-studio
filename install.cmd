@echo off
rem Variant Studio 2.0 - double-click installer for Windows. Runs install.ps1 without changing the execution policy.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set RC=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %RC%
