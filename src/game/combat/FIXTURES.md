# CUT-2026-11-01c — детерминированные фикстуры

Правило proof: **fixture id** + **фиксированный seed** + **API JSON** (лог/снимок)  
или вывод unit-теста с этим fixture id.

Хелпер: `src/game/combat/test/seededRandom.ts` (`withSeed`, `battleApiJson`).

Seed по умолчанию для регрессий: **20261101**, если в тесте не указан иной.

| AC | Fixture id | Seed | Что проверяет | Тест / JSON |
|----|------------|------|---------------|-------------|
| AC-1 | `ac1` | 20261101 | база дуэли морали | `cut-2026-11-01c-ac1.test.ts` |
| AC-1 | `ac1-max-morale-life` | 20261101 | жизнь при max морали | то же |
| AC-1 | `ac1-spend-life` | 20261101 | трата жизни | то же (`spend-life`) |
| AC-1 | `ac1-low-morale-mage` | 20261101 | дебафф мага −20… | то же |
| AC-1 | `ac1-low-morale-warrior` | 20261101 | дебафф воина | то же |
| AC-1 | `ac1-paranoia` | 20261101 | психоз паранойя | `matchId: ac1-paranoia` |
| AC-1 | `ac1-apathy` | 20261101 | апатия | то же |
| AC-1 | `schizo-items` | 20261101 | шизофрения с предметами | `matchId: schizo-items` |
| AC-1 | `schizo-empty` | 20261101 | шизофрения без предметов | `matchId: schizo-empty` |
| AC-1 | `ac1-degradation` | 20261101 | деградация перков/уровня | то же |
| AC-1 | `ac1-masochism` | 20261101 | мазохизм | то же |
| AC-2 | `ac2-beer-phrase` | 20261101 | фраза Пивного элементаля | `cut-2026-11-01c-ac2.test.ts` |
| AC-2 | `ac2-mind-beer-pyro` | 20261101 | Помрачение × элементаль | то же |
| AC-2 | `ac2-assassin-mimic-mana` | 20261101 | Мимик, мана | то же |
| AC-2 | `ac2-eternal-hunger` | 20261101 | Вечный голод | то же |
| AC-2 | `ac2-inquisitor-ind0` | 20261101 | `ind = 0` без бонуса | то же |
| AC-2 | `ac2-inquisitor-ind1` | 20261101 | `ind > 0` даёт +16/+10 | то же / `fixtures-api.test.ts` |
| AC-5 | `ac5-ballad` | 20261101 | баллада 1 цель, снятие эффектов | `cut-2026-11-01c-ac567.test.ts` |
| AC-5 | `ac5-sac` / `ac5-sac2` | 20261101 | Самопожертвование 60% / 59% | то же |
| AC-5 | `ac5-two-centaurs` | 20261101 | два Кентавра, урон себе / ward / lives | `fixtures-api.test.ts` |
| AC-6 | `ac6-pr` | 20261101 | отражение: hit / miss | `ac567` |
| AC-6 | `ac6-chain` | 20261101 | два носителя | то же |
| AC-6 | `ac6-ranged-magic` | 20261101 | дальняя + магия | `fixtures-api.test.ts` |
| AC-6 | `ac6-fetters` | 20261101 | Оковы (через GW path в ac7-fetters) | `ac7-fetters` |
| AC-8 | `ac8-prayer` | 20261101 | Молитва | `cut-2026-11-01c-ac8.test.ts` |
| AC-8 | `ac8-necro` / `ac8-necro1` / `ac8-skip` | 20261101 | Некромантия | то же |
| AC-8 | `ac8-devour` / `ac8-devour20` / `ac8-fs` | 20261101 | Пожирание 19/20 %, Метка | то же |
| AC-9 | `ac9-sq` | 20261101 | квадрат 2×2 | `cut-2026-11-01c-ac9.test.ts` |
| AC-9 | `ac9-cast` | 20261101 | цепочка шансов | то же |
| AC-9 | `ac9-ward` | 20261101 | резист / вард | то же |
| AC-10 | `ac10-mentor` / `ac10-doc` / `ac10-whip` | 20261101 | по срезу | `cut-2026-11-01c-ac10.test.ts` |
| AC-11 | `ac11-ward` / `ac11-moon` / `ac11-azart` / `ac11-azart33` | 20261101 | по срезу | `cut-2026-11-01c-ac11.test.ts` |
| AC-12 | `ac12-gall-l10` | 20261101 | Желчь L10 | `cut-2026-11-01c-ac12.test.ts` |
| AC-13 | `ac13-melee-preview` / `ac13-low-dmg` | 20261101 | прогноз урона | `cut-2026-11-01c-ac13.test.ts` |
| AC-13 | `ac13-abbess-heal-preview` | 20261101 | previewHeal 24–37 при power 49 | то же |
| AC-15 | `ac15-marauder-gold` | 20261101 | `+N золота: усиление отряда` | `fixtures-api.test.ts` |
| AC-15c | `ac15c-contr-melee` | 20261101 | CONTR + ближняя атака | `fixtures-api.test.ts` |

Снимки API JSON (эталон): `src/game/combat/fixtures/*.json` (`fixtures-api.test.ts`).

**Фактические прогоны** (fixture id + seed + **sha** + **ranAt** + result JSON):  
`bun src/game/combat/run-fixtures.ts` → `src/game/combat/fixtures/runs/<id>.json`.

Полный вывод `bun test src/game/combat src/modules/app` на SHA: `fixtures/RUN-<sha>.txt`  
(в шапке файла — `sha=` и `ranAt=`).

### AC-13 — откуда клиент берёт прогноз урона/шанса

1. Снимок боя (WS/`GET` матча) отдаёт `abilities[]` с полями сервера  
   `previewHealMin` / `previewHealMax` / `previewDamageMult` / `previewArmorIgnore` /  
   `previewSource` / `previewAccuracyPenalty` / `attackKind`.
2. UI: `BattlePanel.attackPreviewFor` →  
   - обычная атака: клиентская `previewWeaponAttack` (`features/battle/lib/attackPreview.ts`);  
   - способность: `previewAbilityOnTarget` (сначала серверные preview* из `abilities`,  
     иначе фоллбек `previewHealFromAbilityParts` / `getAbilityPreview`).
3. QA сверяет серверные preview* в JSON abilities с тултипом `≈MIN–MAX` / попадание %.
