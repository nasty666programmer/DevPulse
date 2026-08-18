#!/usr/bin/env bash
# Поднимает backend (порт 3000) и frontend (порт 5173) одной командой.
# Запуск:  bash dev.sh   (или ./dev.sh, если выставлен +x)
# Остановка: Ctrl+C — оба процесса гасятся вместе.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND_PORT=3000
FRONTEND_PORT=5173

PIDS=()

# На Windows/MSYS процессная цепочка bash -> npm -> node(tsx/vite) не всегда
# полностью попадает под taskkill //T с верхнего PID (лишние слои subshell/
# process substitution). Поэтому вдобавок к PID-based kill добиваем процессы
# напрямую по портам — так гарантированно ничего не остаётся висеть.
kill_port() {
    local port="$1"
    local pid
    pid=$(powershell -NoProfile -Command \
        "(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)" \
        2>/dev/null | tr -d '\r')
    [ -n "$pid" ] && taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
}

CLEANED_UP=0
cleanup() {
    [ "$CLEANED_UP" = "1" ] && return
    CLEANED_UP=1
    echo ""
    echo "==> Останавливаю серверы..."
    for pid in "${PIDS[@]:-}"; do
        [ -z "$pid" ] && continue
        if command -v taskkill >/dev/null 2>&1; then
            taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
        else
            kill "$pid" 2>/dev/null || true
        fi
    done
    if command -v powershell >/dev/null 2>&1; then
        kill_port "$BACKEND_PORT"
        kill_port "$FRONTEND_PORT"
    fi
    echo "==> Готово."
}
trap cleanup EXIT INT TERM

if ! command -v npm >/dev/null 2>&1; then
    echo "npm не найден в PATH" >&2
    exit 1
fi

if [ ! -d backend/node_modules ]; then
    echo "==> Устанавливаю зависимости backend..."
    (cd backend && npm install)
fi

if [ ! -d frontend/node_modules ]; then
    echo "==> Устанавливаю зависимости frontend..."
    (cd frontend && npm install)
fi

if [ ! -f backend/.env ]; then
    echo "Внимание: backend/.env не найден (см. backend/.env.example) — backend не подключится к MongoDB." >&2
fi

echo "==> Запускаю backend на http://localhost:$BACKEND_PORT ..."
(cd backend && npm run dev) > >(sed -u 's/^/[backend]  /') 2>&1 &
PIDS+=("$!")

echo "==> Запускаю frontend на http://localhost:$FRONTEND_PORT ..."
(cd frontend && npm run dev) > >(sed -u 's/^/[frontend] /') 2>&1 &
PIDS+=("$!")

echo ""
echo "Backend:  http://localhost:$BACKEND_PORT"
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Ctrl+C — остановить оба."
echo ""

wait
