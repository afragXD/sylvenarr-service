-- Remap TEXT cuid primary keys → UUID without deleting rows.
-- Prerequisite: bun scripts/db-dump-pre-uuid.ts

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "_IdMapPlayer" (
    "old_id" TEXT PRIMARY KEY,
    "new_id" UUID NOT NULL UNIQUE
);
CREATE TABLE "_IdMapMatch" (
    "old_id" TEXT PRIMARY KEY,
    "new_id" UUID NOT NULL UNIQUE
);
CREATE TABLE "_IdMapMatchPick" (
    "old_id" TEXT PRIMARY KEY,
    "new_id" UUID NOT NULL UNIQUE
);
CREATE TABLE "_IdMapOAuthAccount" (
    "old_id" TEXT PRIMARY KEY,
    "new_id" UUID NOT NULL UNIQUE
);
CREATE TABLE "_IdMapNews" (
    "old_id" TEXT PRIMARY KEY,
    "new_id" UUID NOT NULL UNIQUE
);
CREATE TABLE "_IdMapRatingEntry" (
    "old_id" TEXT PRIMARY KEY,
    "new_id" UUID NOT NULL UNIQUE
);

INSERT INTO "_IdMapPlayer" ("old_id", "new_id")
SELECT "id", gen_random_uuid() FROM "Player";

INSERT INTO "_IdMapMatch" ("old_id", "new_id")
SELECT "id", gen_random_uuid() FROM "Match";

INSERT INTO "_IdMapMatchPick" ("old_id", "new_id")
SELECT "id", gen_random_uuid() FROM "MatchPick";

INSERT INTO "_IdMapOAuthAccount" ("old_id", "new_id")
SELECT "id", gen_random_uuid() FROM "OAuthAccount";

INSERT INTO "_IdMapNews" ("old_id", "new_id")
SELECT "id", gen_random_uuid() FROM "News";

INSERT INTO "_IdMapRatingEntry" ("old_id", "new_id")
SELECT "id", gen_random_uuid() FROM "RatingEntry";

-- Loose refs (no FK)
UPDATE "Match" AS m
SET "winnerPlayerId" = map."new_id"::text
FROM "_IdMapPlayer" AS map
WHERE m."winnerPlayerId" = map."old_id";

UPDATE "RatingEntry" AS r
SET "matchId" = map."new_id"::text
FROM "_IdMapMatch" AS map
WHERE r."matchId" = map."old_id";

-- resultSnapshot: replace embedded playerId / pickId strings
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT "old_id", "new_id"::text AS "new_id" FROM "_IdMapPlayer" LOOP
        UPDATE "Match"
        SET "resultSnapshot" = replace("resultSnapshot"::text, rec."old_id", rec."new_id")::jsonb
        WHERE "resultSnapshot" IS NOT NULL
          AND "resultSnapshot"::text LIKE '%' || rec."old_id" || '%';
    END LOOP;

    FOR rec IN SELECT "old_id", "new_id"::text AS "new_id" FROM "_IdMapMatchPick" LOOP
        UPDATE "Match"
        SET "resultSnapshot" = replace("resultSnapshot"::text, rec."old_id", rec."new_id")::jsonb
        WHERE "resultSnapshot" IS NOT NULL
          AND "resultSnapshot"::text LIKE '%' || rec."old_id" || '%';
    END LOOP;
END $$;

ALTER TABLE "Match" DROP CONSTRAINT "Match_hostId_fkey";
ALTER TABLE "Match" DROP CONSTRAINT "Match_guestId_fkey";
ALTER TABLE "MatchPick" DROP CONSTRAINT "MatchPick_matchId_fkey";
ALTER TABLE "MatchPick" DROP CONSTRAINT "MatchPick_playerId_fkey";
ALTER TABLE "OAuthAccount" DROP CONSTRAINT "OAuthAccount_playerId_fkey";
ALTER TABLE "News" DROP CONSTRAINT "News_authorId_fkey";
ALTER TABLE "RatingEntry" DROP CONSTRAINT "RatingEntry_playerId_fkey";

UPDATE "Match" AS m
SET "hostId" = map."new_id"::text
FROM "_IdMapPlayer" AS map
WHERE m."hostId" = map."old_id";

UPDATE "Match" AS m
SET "guestId" = map."new_id"::text
FROM "_IdMapPlayer" AS map
WHERE m."guestId" = map."old_id";

UPDATE "Match" AS m
SET "id" = map."new_id"::text
FROM "_IdMapMatch" AS map
WHERE m."id" = map."old_id";

UPDATE "MatchPick" AS mp
SET "playerId" = map."new_id"::text
FROM "_IdMapPlayer" AS map
WHERE mp."playerId" = map."old_id";

UPDATE "MatchPick" AS mp
SET "matchId" = map."new_id"::text
FROM "_IdMapMatch" AS map
WHERE mp."matchId" = map."old_id";

UPDATE "MatchPick" AS mp
SET "id" = map."new_id"::text
FROM "_IdMapMatchPick" AS map
WHERE mp."id" = map."old_id";

UPDATE "OAuthAccount" AS oa
SET "playerId" = map."new_id"::text
FROM "_IdMapPlayer" AS map
WHERE oa."playerId" = map."old_id";

UPDATE "OAuthAccount" AS oa
SET "id" = map."new_id"::text
FROM "_IdMapOAuthAccount" AS map
WHERE oa."id" = map."old_id";

UPDATE "News" AS n
SET "authorId" = map."new_id"::text
FROM "_IdMapPlayer" AS map
WHERE n."authorId" = map."old_id";

UPDATE "News" AS n
SET "id" = map."new_id"::text
FROM "_IdMapNews" AS map
WHERE n."id" = map."old_id";

UPDATE "RatingEntry" AS r
SET "playerId" = map."new_id"::text
FROM "_IdMapPlayer" AS map
WHERE r."playerId" = map."old_id";

UPDATE "RatingEntry" AS r
SET "id" = map."new_id"::text
FROM "_IdMapRatingEntry" AS map
WHERE r."id" = map."old_id";

UPDATE "Player" AS p
SET "id" = map."new_id"::text
FROM "_IdMapPlayer" AS map
WHERE p."id" = map."old_id";

ALTER TABLE "Player" ALTER COLUMN "id" TYPE UUID USING "id"::uuid;
ALTER TABLE "Player" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "Match" ALTER COLUMN "id" TYPE UUID USING "id"::uuid;
ALTER TABLE "Match" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Match" ALTER COLUMN "hostId" TYPE UUID USING "hostId"::uuid;
ALTER TABLE "Match" ALTER COLUMN "guestId" TYPE UUID USING "guestId"::uuid;
ALTER TABLE "Match" ALTER COLUMN "winnerPlayerId" TYPE UUID USING "winnerPlayerId"::uuid;

ALTER TABLE "MatchPick" ALTER COLUMN "id" TYPE UUID USING "id"::uuid;
ALTER TABLE "MatchPick" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "MatchPick" ALTER COLUMN "matchId" TYPE UUID USING "matchId"::uuid;
ALTER TABLE "MatchPick" ALTER COLUMN "playerId" TYPE UUID USING "playerId"::uuid;

ALTER TABLE "OAuthAccount" ALTER COLUMN "id" TYPE UUID USING "id"::uuid;
ALTER TABLE "OAuthAccount" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "OAuthAccount" ALTER COLUMN "playerId" TYPE UUID USING "playerId"::uuid;

ALTER TABLE "News" ALTER COLUMN "id" TYPE UUID USING "id"::uuid;
ALTER TABLE "News" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "News" ALTER COLUMN "authorId" TYPE UUID USING "authorId"::uuid;

ALTER TABLE "RatingEntry" ALTER COLUMN "id" TYPE UUID USING "id"::uuid;
ALTER TABLE "RatingEntry" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "RatingEntry" ALTER COLUMN "playerId" TYPE UUID USING "playerId"::uuid;
ALTER TABLE "RatingEntry" ALTER COLUMN "matchId" TYPE UUID USING "matchId"::uuid;

ALTER TABLE "Match"
    ADD CONSTRAINT "Match_hostId_fkey"
    FOREIGN KEY ("hostId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Match"
    ADD CONSTRAINT "Match_guestId_fkey"
    FOREIGN KEY ("guestId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MatchPick"
    ADD CONSTRAINT "MatchPick_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchPick"
    ADD CONSTRAINT "MatchPick_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OAuthAccount"
    ADD CONSTRAINT "OAuthAccount_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "News"
    ADD CONSTRAINT "News_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RatingEntry"
    ADD CONSTRAINT "RatingEntry_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE "_IdMapPlayer";
DROP TABLE "_IdMapMatch";
DROP TABLE "_IdMapMatchPick";
DROP TABLE "_IdMapOAuthAccount";
DROP TABLE "_IdMapNews";
DROP TABLE "_IdMapRatingEntry";
