-- DropForeignKey
ALTER TABLE "Course" DROP CONSTRAINT "Course_speakerId_fkey";

-- DropIndex
DROP INDEX "Course_speakerId_idx";

-- AlterTable
ALTER TABLE "Course" DROP COLUMN "speakerId";

-- CreateTable
CREATE TABLE "_CourseToSpeaker" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CourseToSpeaker_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_CourseToSpeaker_B_index" ON "_CourseToSpeaker"("B");

-- AddForeignKey
ALTER TABLE "_CourseToSpeaker" ADD CONSTRAINT "_CourseToSpeaker_A_fkey" FOREIGN KEY ("A") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseToSpeaker" ADD CONSTRAINT "_CourseToSpeaker_B_fkey" FOREIGN KEY ("B") REFERENCES "Speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
