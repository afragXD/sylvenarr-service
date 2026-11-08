-- CUT: roleSummary / теги Воина-призрака под текущий кит (жатва-self, оковы <50%, слуга из союзного трупа). Без re-seed.

UPDATE "HeroClass"
SET
  "roleSummary" = 'Воин с низкой инициативой и врождённым сопротивлением к Оружию. Парализующая катана; «Чёрная жатва» — самобафф (+крит-банк и точность). «Оковы взаимного терпения» только при ОЗ < 50%. Ульта «Личный слуга» поднимает скелета из союзного трупа. «Жизнь на нитке» усиливает урон при низком ОЗ.'
WHERE "code" = 'GhostWarrior';

DELETE FROM "HeroClassRoleTag"
WHERE "heroClassCode" = 'GhostWarrior' AND "tagId" = 'vampirism';

INSERT INTO "HeroClassRoleTag" ("heroClassCode", "tagId")
VALUES ('GhostWarrior', 'summoner')
ON CONFLICT ("heroClassCode", "tagId") DO NOTHING;
