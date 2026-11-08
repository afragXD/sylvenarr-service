#!/bin/sh
set -e
# Общий volume `/app/static` с Angie: докладываем недостающие seed-файлы из образа,
# не перезаписывая уже лежащее на volume.
mkdir -p /app/static
if [ -d /app/static-seed ]; then
  cp -rn /app/static-seed/. /app/static/ 2>/dev/null || true
fi
{ [ -z "$GIT_SHA" ] || [ "$GIT_SHA" = unknown ]; } && export GIT_SHA=$(cat /app/GIT_SHA 2>/dev/null || echo unknown)

# Применяем pending Prisma-миграции к БД (данные/схема). Seed здесь НЕ запускаем.
if [ -z "$DATABASE_URL" ]; then
  echo "docker-entrypoint: DATABASE_URL is empty — cannot migrate" >&2
  exit 1
fi
echo "docker-entrypoint: prisma migrate deploy (GIT_SHA=$GIT_SHA)"
bunx prisma migrate deploy

exec ./server
