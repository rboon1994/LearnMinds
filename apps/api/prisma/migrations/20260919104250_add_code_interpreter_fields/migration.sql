-- AlterTable
ALTER TABLE "AgentConversation" ADD COLUMN     "codeInterpreterContainerId" TEXT;

-- AlterTable
ALTER TABLE "AgentMessage" ADD COLUMN     "codeInterpreterCalls" INTEGER;
