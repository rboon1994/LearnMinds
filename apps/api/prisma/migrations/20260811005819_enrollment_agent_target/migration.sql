-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "agentId" TEXT;

-- CreateIndex
CREATE INDEX "Enrollment_agentId_idx" ON "Enrollment"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_agentId_studentId_key" ON "Enrollment"("agentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_agentId_tenantId_key" ON "Enrollment"("agentId", "tenantId");

-- CreateIndex: speeds up the enrollment-validity check agent-chat.service.ts runs on every
-- list/create/send call (assignee + non-expired), which a single-column index alone can't
-- satisfy in one scan.
CREATE INDEX "Enrollment_studentId_expiresAt_idx" ON "Enrollment"("studentId", "expiresAt");

-- CreateIndex
CREATE INDEX "Enrollment_tenantId_expiresAt_idx" ON "Enrollment"("tenantId", "expiresAt");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint: target widened from a 2-way XOR (seriesId/courseId) to exactly-one-of-three
-- (seriesId/courseId/agentId) — Postgres can't chain `<>` past two terms, so this replaces the
-- boolean-inequality form with a boolean-sum-equals-1 form instead.
ALTER TABLE "Enrollment" DROP CONSTRAINT "chk_enrollment_target";
ALTER TABLE "Enrollment" ADD CONSTRAINT "chk_enrollment_target" CHECK (
  (CASE WHEN "seriesId" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "courseId" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "agentId"  IS NOT NULL THEN 1 ELSE 0 END) = 1
);
