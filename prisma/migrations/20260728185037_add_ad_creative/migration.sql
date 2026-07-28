-- CreateTable
CREATE TABLE "AdCreative" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformAdId" TEXT NOT NULL,
    "platformCampaignId" TEXT,
    "campaignName" TEXT,
    "adName" TEXT,
    "status" TEXT,
    "headline" TEXT,
    "bodyText" TEXT,
    "thumbnailUrl" TEXT,
    "callToAction" TEXT,
    "raw" JSONB,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCreative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdCreative_credentialId_platformAdId_key" ON "AdCreative"("credentialId", "platformAdId");

-- AddForeignKey
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AdCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
