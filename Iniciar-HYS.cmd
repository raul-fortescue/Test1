@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Instala Node.js 24.10 o posterior desde https://nodejs.org y vuelve a abrir este archivo.
  pause
  exit /b 1
)
node --use-env-proxy --env-file-if-exists=.env src/launcher.js
if errorlevel 1 (
  echo No se pudo iniciar HYS. Revisa el mensaje anterior. No cambies la politica de PowerShell.
  pause
  exit /b 1
)
