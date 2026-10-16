-- AlterEnum
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'fighting';
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'finished';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "winnerPlayerId" TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Match_guestId_idx" ON "Match"("guestId");
