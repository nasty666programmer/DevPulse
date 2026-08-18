@echo off
rem Двойной клик по этому файлу поднимает backend (3000) и frontend (5173).
rem Под капотом дергает dev.sh через Git Bash — сам её открывать не нужно.
setlocal
cd /d "%~dp0"

set "BASH_EXE="
if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles%\Git\bin\bash.exe"
if not defined BASH_EXE if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not defined BASH_EXE for %%I in (bash.exe) do set "BASH_EXE=%%~$PATH:I"

if not defined BASH_EXE (
    echo Git Bash не найден. Установите Git for Windows: https://git-scm.com/download/win
    pause
    exit /b 1
)

"%BASH_EXE%" dev.sh

echo.
echo Серверы остановлены.
pause
