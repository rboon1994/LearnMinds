-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('WEBINAR', 'ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'PLANNING', 'SCHEDULED', 'SELLING_FAST', 'LAST_FEW_SEATS', 'FULL', 'CLOSED');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('SALES', 'MARKETING', 'OPERATION', 'HR');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "categories" "EventCategory"[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSession" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "venueMapLink" TEXT,
    "country" TEXT,
    "zoomLink" TEXT,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "memberPrice" DECIMAL(10,2),
    "status" "SessionStatus" NOT NULL DEFAULT 'PLANNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EventSessionToSpeaker" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EventSessionToSpeaker_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "EventSession_eventId_idx" ON "EventSession"("eventId");

-- CreateIndex
CREATE INDEX "EventSession_status_endDateTime_idx" ON "EventSession"("status", "endDateTime");

-- CreateIndex
CREATE INDEX "EventSession_startDateTime_idx" ON "EventSession"("startDateTime");

-- CreateIndex
CREATE INDEX "EventSession_country_idx" ON "EventSession"("country");

-- CreateIndex
CREATE INDEX "_EventSessionToSpeaker_B_index" ON "_EventSessionToSpeaker"("B");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventSessionToSpeaker" ADD CONSTRAINT "_EventSessionToSpeaker_A_fkey" FOREIGN KEY ("A") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventSessionToSpeaker" ADD CONSTRAINT "_EventSessionToSpeaker_B_fkey" FOREIGN KEY ("B") REFERENCES "Speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
