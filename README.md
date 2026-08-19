# DevPulse — запуск проекта

Структура: `backend/` (Express + TypeScript) и `frontend/` (React + Vite) — два независимых
проекта рядом друг с другом, каждый со своим `package.json`/`node_modules`. `dev.sh`/`dev.bat`
в корне запускают оба сразу.

## Способы запуска

**Git Bash** (правый клик по папке проекта → «Open Git Bash here»):
```bash
bash dev.sh
```

**WSL** (если установлен):
```bash
wsl bash dev.sh
```

**Двойной клик** — файл `dev.bat` в корне проекта делает то же самое сам, без открытия терминала вручную (под капотом всё равно дёргает `dev.sh` через Git Bash, так что Git for Windows должен быть установлен).

Первый запуск сам поставит зависимости (`npm install` в `backend/` и в `frontend/`), если их ещё нет.

## Остановка

`Ctrl+C` в том же окне — гасит и backend, и frontend.

## Требования

- Node.js, Git for Windows (для `bash.exe`) — либо WSL.
- MongoDB, доступная по `MONGO_URI` из `backend/.env` (см. `backend/.env.example`) — без неё backend поднимется, но запросы к `/feed/*` будут отдавать 500.

После старта: backend — http://localhost:3000, frontend — http://localhost:5173.

Swagger UI для ручного тестирования API — http://localhost:3000/docs (только локально,
в проде не монтируется — см. `ENABLE_SWAGGER` в `backend/.env.example`).

## Локальный Mongo в Docker

`docker compose up mongo -d` поднимает Mongo для локальной разработки, креды берутся из
корневого `.env` (см. `.env.example`) — сам `docker-compose.yml` трогать не нужно.

Важно: `MONGO_INITDB_ROOT_USERNAME`/`PASSWORD` применяются только при первой инициализации
пустого volume. Если поменял их в `.env`, обычный рестарт контейнера новые креды не
подхватит — нужно пересоздать volume:

```bash
bash mongo-reset.sh
```

Стирает локально собранные RSS-данные — это ожидаемо, коллектор пересоберёт их заново.
