-- CUT-2026-11-05 AC-3: исправление статов после неверной 20261103120000 (без re-seed).
-- Abbess 185/10, Mermaid 162 + MP 10, Titan 36; плюс Детектив/ВП/Ведьма из того же среза.

UPDATE "HeroClass"
SET
  "health" = 185,
  "mana" = 10,
  "maxMana" = 10
WHERE "code" = 'Abbess';

UPDATE "HeroClass"
SET
  "health" = 162,
  "mana" = 10,
  "maxMana" = 10
WHERE "code" = 'Mermaid';

UPDATE "HeroClass"
SET "damage" = 36
WHERE "code" = 'Titan';

UPDATE "HeroClass"
SET "health" = 180
WHERE "code" = 'Detective';

UPDATE "HeroClass"
SET
  "damage" = 23,
  "dodge" = 7
WHERE "code" = 'GhostWarrior';

UPDATE "HeroClass"
SET "accuracy" = 95
WHERE "code" = 'Witch';
