-- CUT-2026-11-09: Русалка инициатива 30 и МР 6, Демон-принц инициатива 35, Травница броня 10.
-- Без re-seed: те же числа в prisma/seed-data/heroes.ts.

UPDATE "HeroClass"
SET
  "initiative" = 30,
  "mana" = 6,
  "maxMana" = 6
WHERE "code" = 'Mermaid';

UPDATE "HeroClass"
SET "initiative" = 35
WHERE "code" = 'DemonLord';

UPDATE "HeroClass"
SET "armor" = 10
WHERE "code" = 'Herbalist';
