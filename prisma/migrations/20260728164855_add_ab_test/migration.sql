-- CreateTable
CREATE TABLE "AbTest" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "controlAdId" TEXT NOT NULL,
    "controlAdSetId" TEXT NOT NULL,
    "variantAdId" TEXT NOT NULL,
    "variantAdSetId" TEXT NOT NULL,
    "testedVariable" TEXT NOT NULL,
    "controlValue" DECIMAL(10,2) NOT NULL,
    "variantValue" DECIMAL(10,2) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "winner" TEXT,
    "resultSummary" JSONB,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AbTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbTest_proposalId_key" ON "AbTest"("proposalId");

-- CreateIndex
CREATE INDEX "AbTest_status_endsAt_idx" ON "AbTest"("status", "endsAt");

-- AddForeignKey
ALTER TABLE "AbTest" ADD CONSTRAINT "AbTest_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbTest" ADD CONSTRAINT "AbTest_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
