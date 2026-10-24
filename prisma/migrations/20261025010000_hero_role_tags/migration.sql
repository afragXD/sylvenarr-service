-- CreateTable
CREATE TABLE "HeroRoleTag" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroRoleTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeroClassRoleTag" (
    "heroClassCode" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HeroClassRoleTag_pkey" PRIMARY KEY ("heroClassCode","tagId")
);

-- CreateIndex
CREATE INDEX "HeroClassRoleTag_tagId_idx" ON "HeroClassRoleTag"("tagId");

-- AddForeignKey
ALTER TABLE "HeroClassRoleTag" ADD CONSTRAINT "HeroClassRoleTag_heroClassCode_fkey" FOREIGN KEY ("heroClassCode") REFERENCES "HeroClass"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeroClassRoleTag" ADD CONSTRAINT "HeroClassRoleTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "HeroRoleTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
