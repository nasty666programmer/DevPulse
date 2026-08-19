@echo off
rem Двойной клик по этому файлу пересоздаёт локальный mongo-контейнер и его
rem volume с текущими кредами из .env (см. mongo-reset.sh — нужно после смены
rem MONGO_INITDB_ROOT_USERNAME/PASSWORD, простой restart их не подхватывает).
rem Под капотом дергает mongo-reset.sh через Git Bash — сам её открывать не нужно.
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

"%BASH_EXE%" mongo-reset.sh

echo.
pause
