# sylvenarr-service

Базовый шаблон API на [ElysiaJS](https://elysiajs.com/).

### Stack
- Web framework - [ElysiaJS](https://elysiajs.com/)
- Linter - [Biome](https://biomejs.dev/)
- ORM - [Prisma](https://www.prisma.io/) ([PostgreSQL](https://www.postgresql.org/))
- Elysia plugins - [CORS](https://elysiajs.com/plugins/cors.html), [Swagger](https://elysiajs.com/plugins/swagger.html), [Static](https://elysiajs.com/plugins/static.html)

## Development

Скопируйте `.env.example` в `.env` и при необходимости поправьте значения.

```bash
bun install
bunx prisma generate
bun dev
```

Healthcheck: `GET /healthcheck`

## Migrations

Generate new migration:

```bash
bunx prisma migrate dev
```

Apply migrations:

```bash
bunx prisma migrate deploy
```

## Production

```bash
bun run start
```

Или соберите образ через `Dockerfile`.
