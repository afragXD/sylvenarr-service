-- AlterTable
ALTER TABLE "Player" ADD COLUMN "passwordHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Player_displayName_key" ON "Player"("displayName");

-- CreateIndex
CREATE UNIQUE INDEX "Player_email_key" ON "Player"("email");
