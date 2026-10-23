# Многостадийная сборка для компиляции в двоичный файл
FROM oven/bun:1 AS build

WORKDIR /app

# Кеширование установки зависимостей
COPY package.json bun.lock ./
RUN bun install

# Копирование исходного кода
COPY . .

ENV NODE_ENV=production

# Компиляция в двоичный файл с оптимизациями
# --minify используется поскольку проект не использует OpenTelemetry
RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile server \
    src/index.ts

# Финальный минимальный образ
FROM oven/bun:1-slim

WORKDIR /app

COPY --from=build /app/server server
COPY --from=build /app/node_modules /app/node_modules
# Seed для volume `/app/static` (общий с Angie): public/avatars и т.п.
# Сцены новостей на volume кладутся руками / через POST /admin/news/upload.
COPY --from=build /app/static /app/static-seed
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production

CMD ["/app/docker-entrypoint.sh"]

EXPOSE 4000
