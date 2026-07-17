-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "courseId" TEXT,
ALTER COLUMN "seriesId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_courseId_studentId_key" ON "Enrollment"("courseId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_courseId_tenantId_key" ON "Enrollment"("courseId", "tenantId");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint: exactly one of studentId/tenantId must be set (pre-existing app-only rule,
-- now backstopped at the DB level too, since we're already migrating this table).
ALTER TABLE "Enrollment" ADD CONSTRAINT "chk_enrollment_assignee"
  CHECK (("studentId" IS NOT NULL) <> ("tenantId" IS NOT NULL));

-- CheckConstraint: exactly one of seriesId/courseId must be set.
ALTER TABLE "Enrollment" ADD CONSTRAINT "chk_enrollment_target"
  CHECK (("seriesId" IS NOT NULL) <> ("courseId" IS NOT NULL));
