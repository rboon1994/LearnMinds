-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_courseId_fkey";

-- DropIndex
DROP INDEX "Enrollment_courseId_idx";

-- DropIndex
DROP INDEX "Enrollment_courseId_studentId_key";

-- DropIndex
DROP INDEX "Enrollment_courseId_tenantId_key";

-- AlterTable
ALTER TABLE "Enrollment" DROP COLUMN "courseId",
ALTER COLUMN "seriesId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Enrollment_seriesId_idx" ON "Enrollment"("seriesId");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "CourseSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

