-- AlterTable
ALTER TABLE "AgentMessage" ADD COLUMN     "costUsd" DECIMAL(10,6),
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "outputTokens" INTEGER;
