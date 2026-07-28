-- CreateEnum
CREATE TYPE "BrandStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "BrandRole" AS ENUM ('OWNER', 'MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('META', 'GOOGLE');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('PENDING', 'CONNECTED', 'AUTH_ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "CollectionState" AS ENUM ('OK', 'AUTH_ERROR', 'EMPTY', 'API_ERROR');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('BOM', 'MEDIO', 'RUIM');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('NEW_CAMPAIGN', 'PAUSE_AD', 'ACTIVATE_AD', 'ADJUST_BUDGET', 'CREATE_AD_VARIATION', 'CREATE_AB_TEST', 'OTHER');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('NEEDS_MORE_DATA', 'PENDING', 'APPROVED', 'REJECTED', 'TEST', 'ADJUST', 'EXECUTED', 'EXECUTION_FAILED');

-- CreateEnum
CREATE TYPE "ExecutionAction" AS ENUM ('PAUSE_AD', 'ACTIVATE_AD', 'CREATE_AD_VARIATION', 'CREATE_AB_TEST');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "role" "BrandRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BrandStatus" NOT NULL DEFAULT 'ONBOARDING',
    "topicKeywords" TEXT[],
    "excludedKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priorityOrder" INTEGER NOT NULL DEFAULT 0,
    "colorHex" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCredential" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "loginCustomerId" TEXT,
    "label" TEXT,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "tokenIv" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "CredentialStatus" NOT NULL DEFAULT 'PENDING',
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdMetricSnapshot" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformCampaignId" TEXT,
    "campaignName" TEXT,
    "platformAdId" TEXT,
    "adName" TEXT,
    "collectionState" "CollectionState" NOT NULL,
    "dateRangeStart" TIMESTAMP(3) NOT NULL,
    "dateRangeEnd" TIMESTAMP(3) NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "cpc" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "cpl" DECIMAL(10,2),
    "cpa" DECIMAL(10,2),
    "raw" JSONB,
    "errorMessage" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingSnapshot" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verdict" "Verdict" NOT NULL,
    "bucketsJson" JSONB NOT NULL,
    "recommendedActionsJson" JSONB NOT NULL,
    "sourceRangeStart" TIMESTAMP(3) NOT NULL,
    "sourceRangeEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RankingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationThread" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "ConversationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "toolCallId" TEXT,
    "toolArgsJson" JSONB,
    "toolResultJson" JSONB,
    "tokensInput" INTEGER,
    "tokensOutput" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "threadId" TEXT,
    "createdByUserId" TEXT,
    "type" "ProposalType" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "metricsJson" JSONB NOT NULL,
    "suggestedAction" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "rollbackPlan" TEXT NOT NULL,
    "platform" "Platform",
    "platformCampaignId" TEXT,
    "platformAdId" TEXT,
    "payloadJson" JSONB NOT NULL,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionLog" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "executedByUserId" TEXT,
    "platform" "Platform" NOT NULL,
    "action" "ExecutionAction" NOT NULL,
    "requestJson" JSONB NOT NULL,
    "responseJson" JSONB,
    "status" "ExecutionStatus" NOT NULL,
    "errorMessage" TEXT,
    "rollbackInfoJson" JSONB,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulerRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "SchedulerRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulerBrandResult" (
    "id" TEXT NOT NULL,
    "schedulerRunId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "proposalId" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "SchedulerBrandResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirewallLog" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "contentSnippet" TEXT NOT NULL,
    "matchedKeywords" TEXT[],
    "decision" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirewallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BrandAccess_userId_brandId_key" ON "BrandAccess"("userId", "brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AdCredential_brandId_platform_externalAccountId_key" ON "AdCredential"("brandId", "platform", "externalAccountId");

-- CreateIndex
CREATE INDEX "AdMetricSnapshot_brandId_platform_collectedAt_idx" ON "AdMetricSnapshot"("brandId", "platform", "collectedAt");

-- CreateIndex
CREATE INDEX "AdMetricSnapshot_brandId_platformAdId_idx" ON "AdMetricSnapshot"("brandId", "platformAdId");

-- CreateIndex
CREATE INDEX "RankingSnapshot_brandId_computedAt_idx" ON "RankingSnapshot"("brandId", "computedAt");

-- CreateIndex
CREATE INDEX "ConversationThread_brandId_updatedAt_idx" ON "ConversationThread"("brandId", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Proposal_brandId_status_idx" ON "Proposal"("brandId", "status");

-- CreateIndex
CREATE INDEX "ExecutionLog_brandId_executedAt_idx" ON "ExecutionLog"("brandId", "executedAt");

-- CreateIndex
CREATE INDEX "FirewallLog_brandId_createdAt_idx" ON "FirewallLog"("brandId", "createdAt");

-- AddForeignKey
ALTER TABLE "BrandAccess" ADD CONSTRAINT "BrandAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandAccess" ADD CONSTRAINT "BrandAccess_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCredential" ADD CONSTRAINT "AdCredential_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdMetricSnapshot" ADD CONSTRAINT "AdMetricSnapshot_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdMetricSnapshot" ADD CONSTRAINT "AdMetricSnapshot_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AdCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingSnapshot" ADD CONSTRAINT "RankingSnapshot_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ConversationThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLog" ADD CONSTRAINT "ExecutionLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLog" ADD CONSTRAINT "ExecutionLog_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLog" ADD CONSTRAINT "ExecutionLog_executedByUserId_fkey" FOREIGN KEY ("executedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulerBrandResult" ADD CONSTRAINT "SchedulerBrandResult_schedulerRunId_fkey" FOREIGN KEY ("schedulerRunId") REFERENCES "SchedulerRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulerBrandResult" ADD CONSTRAINT "SchedulerBrandResult_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirewallLog" ADD CONSTRAINT "FirewallLog_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
