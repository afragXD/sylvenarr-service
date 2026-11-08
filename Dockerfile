# Многостадийная сборка для компиляции в двоичный файл
FROM oven/bun:1 AS build

WORKDIR /app

# Кеширование установки зависимостей
COPY package.json bun.lock ./
RUN bun install

# Копирование исходного кода
COPY . .
RUN R=$(sed -n 's/^ref: //p' .git/HEAD 2>/dev/null); \
    SHA=$( [ -n "$R" ] && { cat ".git/$R" 2>/dev/null || awk -v r="$R" '$2==r{print $1}' .git/packed-refs 2>/dev/null; } || head -c40 .git/HEAD 2>/dev/null ); \
    echo "${SHA:-unknown}" > /app/GIT_SHA && rm -rf .git

ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
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

ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

COPY --from=build /app/server server
COPY --from=build /app/GIT_SHA /app/GIT_SHA
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/bun.lock /app/bun.lock
COPY --from=build /app/prisma /app/prisma
COPY --from=build /app/prisma.config.ts /app/prisma.config.ts
# Seed для volume `/app/static` (общий с Angie): public/avatars и т.п.
# Сцены новостей на volume кладутся руками / через POST /admin/news/upload.
COPY --from=build /app/static /app/static-seed
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production

CMD ["/app/docker-entrypoint.sh"]

EXPOSE 4000
