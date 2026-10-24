-- CreateEnum
CREATE TYPE "MatchPickSource" AS ENUM ('draft', 'preset');

-- AlterTable
ALTER TABLE "Match" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MatchPick" ADD COLUMN     "source" "MatchPickSource" NOT NULL DEFAULT 'draft',
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "News" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OAuthAccount" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Player" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RatingEntry" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "SquadPreset" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "teamSize" INTEGER NOT NULL,
    "playerId" UUID,
    "catalogCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SquadPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SquadPresetSlot" (
    "id" UUID NOT NULL,
    "presetId" UUID NOT NULL,
    "heroClassCode" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "slotOrder" INTEGER NOT NULL,

    CONSTRAINT "SquadPresetSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SquadPreset_catalogCode_key" ON "SquadPreset"("catalogCode");

-- CreateIndex
CREATE INDEX "SquadPreset_playerId_teamSize_idx" ON "SquadPreset"("playerId", "teamSize");

-- CreateIndex
CREATE INDEX "SquadPresetSlot_presetId_idx" ON "SquadPresetSlot"("presetId");

-- CreateIndex
CREATE UNIQUE INDEX "SquadPresetSlot_presetId_slotOrder_key" ON "SquadPresetSlot"("presetId", "slotOrder");

-- AddForeignKey
ALTER TABLE "SquadPreset" ADD CONSTRAINT "SquadPreset_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadPresetSlot" ADD CONSTRAINT "SquadPresetSlot_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "SquadPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadPresetSlot" ADD CONSTRAINT "SquadPresetSlot_heroClassCode_fkey" FOREIGN KEY ("heroClassCode") REFERENCES "HeroClass"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
