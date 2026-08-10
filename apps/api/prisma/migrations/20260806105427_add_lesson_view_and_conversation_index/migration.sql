-- CreateTable
CREATE TABLE "LessonView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 1,
    "firstViewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonView_userId_lastViewedAt_idx" ON "LessonView"("userId", "lastViewedAt");

-- CreateIndex
CREATE INDEX "LessonView_lessonId_idx" ON "LessonView"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonView_userId_lessonId_key" ON "LessonView"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "AgentConversation_userId_idx" ON "AgentConversation"("userId");

-- AddForeignKey
ALTER TABLE "LessonView" ADD CONSTRAINT "LessonView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonView" ADD CONSTRAINT "LessonView_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
