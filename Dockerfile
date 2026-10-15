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
COPY --from=build /app/static/public /app/static/public

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 4000
