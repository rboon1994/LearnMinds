-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "speakerId" TEXT;

-- CreateIndex
CREATE INDEX "Course_speakerId_idx" ON "Course"("speakerId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
