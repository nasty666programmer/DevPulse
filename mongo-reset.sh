#!/usr/bin/env bash
# Пересоздаёт локальный mongo-контейнер и его volume с нуля, подхватывая
# актуальные MONGO_INITDB_ROOT_USERNAME/PASSWORD из корневого .env. Трогает
# только сервис mongo — backend/frontend (если подняты) не останавливаются.
#
# Нужен каждый раз, когда меняешь эти креды в .env: MongoDB создаёт root-юзера
# только при первой инициализации ПУСТОГО /data/db — простой restart
# контейнера их не обновит, старые креды останутся действующими, пока не
# пересоздать volume (то есть без этого скрипта).
#
# Стирает все локально собранные RSS-данные — это ожидаемо и не страшно,
# коллектор пересоберёт их заново при следующем /rss/collect.
#
# Запуск: bash mongo-reset.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f .env ]; then
    echo "Внимание: .env не найден в корне проекта (см. .env.example) — mongo поднимется с дефолтными кредами." >&2
fi

echo "==> Останавливаю и удаляю mongo-контейнер..."
docker compose rm -sf mongo

# Именованный volume ("mongodata:" в docker-compose.yml) не привязан к
# конкретному контейнеру и переживает "docker compose rm" — нужно удалить его
# отдельно, иначе новый контейнер унаследует старые данные и старого юзера.
# Ищем по суффиксу имени, а не хардкодим префикс проекта (он зависит от имени
# папки и может отличаться на разных машинах).
mapfile -t VOLUMES < <(docker volume ls --format '{{.Name}}' | grep -E '_mongodata$' || true)

if [ "${#VOLUMES[@]}" -eq 0 ]; then
    echo "==> Volume mongodata не найден — похоже, это первый запуск."
elif [ "${#VOLUMES[@]}" -gt 1 ]; then
    echo "Не понимаю, какой volume удалять — нашёл несколько подходящих:" >&2
    printf '  %s\n' "${VOLUMES[@]}" >&2
    echo "Удали лишний вручную (docker volume rm <имя>) и запусти скрипт снова." >&2
    exit 1
else
    echo "==> Удаляю volume ${VOLUMES[0]}..."
    docker volume rm "${VOLUMES[0]}"
fi

echo "==> Поднимаю mongo заново с текущими кредами из .env..."
docker compose up mongo -d

echo "==> Готово."
echo "    Если backend уже был запущен и подключён к старому mongo — пересоздай его"
echo "    (обычный restart не перечитает новые креды из .env, нужен именно up -d):"
echo "    docker compose up -d backend-service"
