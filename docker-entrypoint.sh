#!/bin/sh
set -e
# Общий volume `/app/static` с Angie: докладываем недостающие seed-файлы из образа,
# не перезаписывая уже лежащее на volume.
mkdir -p /app/static
if [ -d /app/static-seed ]; then
  cp -rn /app/static-seed/. /app/static/ 2>/dev/null || true
fi
exec ./server
