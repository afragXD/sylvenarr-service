-- AlterEnum
ALTER TYPE "MatchStatus" ADD VALUE 'drafting';
ALTER TYPE "MatchStatus" ADD VALUE 'drafted';

-- AlterTable
ALTER TABLE "HeroClass" ADD COLUMN "size" INTEGER NOT NULL DEFAULT 1;

UPDATE "HeroClass" SET "size" = 2 WHERE "code" IN ('DemonLord', 'Dracolich');

-- CreateTable
CREATE TABLE "MatchPick" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "heroClassCode" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "pickOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchPick_matchId_idx" ON "MatchPick"("matchId");

-- CreateIndex
CREATE INDEX "MatchPick_playerId_idx" ON "MatchPick"("playerId");

-- AddForeignKey
ALTER TABLE "MatchPick" ADD CONSTRAINT "MatchPick_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPick" ADD CONSTRAINT "MatchPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPick" ADD CONSTRAINT "MatchPick_heroClassCode_fkey" FOREIGN KEY ("heroClassCode") REFERENCES "HeroClass"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
