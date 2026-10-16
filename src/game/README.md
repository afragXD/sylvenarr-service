# Game engine

## Фаза 2 — Draft

- `draft/settings.ts` — лимиты из legacy (`INITIAL_TEAM_SIZE`, `MAX_ROW_SIZE`)
- `draft/rules.ts` — валидация пика, ход, завершение draft
- Роуты: `POST /matches/:id/draft/pick`, `POST /matches/:id/draft/random`

## Далее (фаза 3+)

- бой (`Hero`, effects, resists, очередь хода)
- ярмарка и перки
