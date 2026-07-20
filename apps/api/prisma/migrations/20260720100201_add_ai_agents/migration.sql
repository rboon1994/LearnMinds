-- CreateEnum
CREATE TYPE "AiAgentModelStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "AiAgentModel" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "maxTokenLimit" INTEGER NOT NULL,
    "inputTokenPrice" DECIMAL(10,6) NOT NULL,
    "outputTokenPrice" DECIMAL(10,6) NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "AiAgentModelStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "instructions" TEXT,
    "thumbnail" TEXT,
    "tenantId" TEXT,
    "modelId" TEXT NOT NULL,
    "seriesId" TEXT,
    "creatorId" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentModel_modelId_key" ON "AiAgentModel"("modelId");

-- CreateIndex
CREATE INDEX "AiAgent_tenantId_idx" ON "AiAgent"("tenantId");

-- CreateIndex
CREATE INDEX "AiAgent_seriesId_idx" ON "AiAgent"("seriesId");

-- CreateIndex
CREATE INDEX "AiAgent_modelId_idx" ON "AiAgent"("modelId");

-- CreateIndex
CREATE INDEX "AiAgent_creatorId_idx" ON "AiAgent"("creatorId");

-- AddForeignKey
ALTER TABLE "AiAgent" ADD CONSTRAINT "AiAgent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgent" ADD CONSTRAINT "AiAgent_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AiAgentModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgent" ADD CONSTRAINT "AiAgent_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "CourseSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgent" ADD CONSTRAINT "AiAgent_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Speaker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
