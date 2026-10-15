-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('waiting', 'ready', 'cancelled');

-- CreateEnum
CREATE TYPE "RatingResult" AS ENUM ('win', 'loss');

-- CreateTable
CREATE TABLE "HeroClass" (
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "health" INTEGER NOT NULL,
    "damage" INTEGER NOT NULL,
    "armor" INTEGER NOT NULL,
    "initiative" INTEGER NOT NULL,
    "dodge" INTEGER NOT NULL,
    "luck" INTEGER NOT NULL,
    "morale" INTEGER NOT NULL,
    "mana" INTEGER NOT NULL,
    "power" INTEGER NOT NULL,
    "gold" INTEGER NOT NULL,
    "accuracy" INTEGER NOT NULL,
    "isPlayable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroClass_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'waiting',
    "inviteCode" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "guestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingEntry" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "result" "RatingResult" NOT NULL,
    "heroClassCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Match_inviteCode_key" ON "Match"("inviteCode");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE INDEX "Match_hostId_idx" ON "Match"("hostId");

-- CreateIndex
CREATE INDEX "RatingEntry_playerId_idx" ON "RatingEntry"("playerId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingEntry" ADD CONSTRAINT "RatingEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingEntry" ADD CONSTRAINT "RatingEntry_heroClassCode_fkey" FOREIGN KEY ("heroClassCode") REFERENCES "HeroClass"("code") ON DELETE SET NULL ON UPDATE CASCADE;
