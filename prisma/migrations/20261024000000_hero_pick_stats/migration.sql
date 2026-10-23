-- CreateTable
CREATE TABLE "HeroPickStat" (
    "playerId" UUID NOT NULL,
    "heroClassCode" TEXT NOT NULL,
    "pickCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroPickStat_pkey" PRIMARY KEY ("playerId","heroClassCode")
);

-- CreateIndex
CREATE INDEX "HeroPickStat_heroClassCode_idx" ON "HeroPickStat"("heroClassCode");

-- CreateIndex
CREATE INDEX "HeroPickStat_pickCount_idx" ON "HeroPickStat"("pickCount");

-- AddForeignKey
ALTER TABLE "HeroPickStat" ADD CONSTRAINT "HeroPickStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeroPickStat" ADD CONSTRAINT "HeroPickStat_heroClassCode_fkey" FOREIGN KEY ("heroClassCode") REFERENCES "HeroClass"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
