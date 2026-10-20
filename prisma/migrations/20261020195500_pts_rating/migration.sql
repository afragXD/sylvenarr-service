-- AlterEnum
ALTER TYPE "RatingResult" ADD VALUE 'draw';

-- AlterTable
ALTER TABLE "Player" ADD COLUMN "pts" INTEGER NOT NULL DEFAULT 1500;

-- AlterTable
ALTER TABLE "RatingEntry" ADD COLUMN "matchId" TEXT,
ADD COLUMN "ptsBefore" INTEGER,
ADD COLUMN "ptsDelta" INTEGER,
ADD COLUMN "ptsAfter" INTEGER;

-- CreateIndex
CREATE INDEX "RatingEntry_matchId_idx" ON "RatingEntry"("matchId");
