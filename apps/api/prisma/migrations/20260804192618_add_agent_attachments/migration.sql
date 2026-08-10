-- CreateEnum
CREATE TYPE "AgentAttachmentType" AS ENUM ('DOCUMENT', 'IMAGE');

-- AlterTable
ALTER TABLE "AgentConversation" ADD COLUMN     "vectorStoreId" TEXT;

-- CreateTable
CREATE TABLE "AgentAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" "AgentAttachmentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "openaiFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentAttachment_messageId_idx" ON "AgentAttachment"("messageId");

-- AddForeignKey
ALTER TABLE "AgentAttachment" ADD CONSTRAINT "AgentAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AgentMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
