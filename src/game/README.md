# Game engine

Механика драфта и боя — порт/референс оригинального VK-бота
[arenamsterbot](https://github.com/enlacroix/arenamsterbot) ([enlacroix](https://github.com/enlacroix)).

## Фаза 2 — Draft

- `draft/settings.ts` — лимиты из legacy (`INITIAL_TEAM_SIZE`, `MAX_ROW_SIZE`)
- `draft/rules.ts` — валидация пика, ход, завершение draft
- Роуты: `POST /matches/:id/draft/pick`, `POST /matches/:id/draft/random`

## Фаза 3 — Combat

- `combat/engine.ts` — очередь хода, attack/defend/wait, победа/ничья
- `combat/store.ts` — Redis или in-memory state
- `combat/hub.ts` — fan-out для WebSocket
- `combat/skills.ts` — классовые множители и подписи атак (полный порт characters/* — дальше)
- Роуты: `POST /matches/:id/battle/action`, WS `/matches/ws/:id`
