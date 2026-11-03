-- CUT-2026-11-01c AC-3: боевая база героев (без re-seed; новости не трогаем).
-- Аббатиса 205/12, Русалка 180, Титан урон 26, Демон-принц точность 95.

UPDATE "HeroClass"
SET
  "health" = 205,
  "mana" = 12,
  "maxMana" = 12
WHERE "code" = 'Abbess';

UPDATE "HeroClass"
SET "health" = 180
WHERE "code" = 'Mermaid';

UPDATE "HeroClass"
SET "damage" = 26
WHERE "code" = 'Titan';

UPDATE "HeroClass"
SET "accuracy" = 95
WHERE "code" = 'DemonLord';
