-- CreateEnum
CREATE TYPE "PlayerRole" AS ENUM ('player', 'admin');

-- CreateEnum
CREATE TYPE "NewsCategory" AS ENUM ('announcement', 'devlog', 'update', 'fix');

-- AlterTable
ALTER TABLE "Player" ADD COLUMN "role" "PlayerRole" NOT NULL DEFAULT 'player';

-- CreateTable
CREATE TABLE "News" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "NewsCategory" NOT NULL DEFAULT 'devlog',
    "coverUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "News_slug_key" ON "News"("slug");

-- CreateIndex
CREATE INDEX "News_publishedAt_idx" ON "News"("publishedAt");

-- AddForeignKey
ALTER TABLE "News" ADD CONSTRAINT "News_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
