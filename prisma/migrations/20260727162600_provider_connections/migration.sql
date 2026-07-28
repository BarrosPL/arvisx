-- DropIndex
DROP INDEX "AdCredential_brandId_platform_externalAccountId_key";

-- AlterTable
ALTER TABLE "AdCredential" DROP COLUMN "encryptedAccessToken",
DROP COLUMN "encryptedRefreshToken",
DROP COLUMN "tokenExpiresAt",
ADD COLUMN     "providerConnectionId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ProviderConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "label" TEXT,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "CredentialStatus" NOT NULL DEFAULT 'PENDING',
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdCredential_platform_externalAccountId_key" ON "AdCredential"("platform", "externalAccountId");

-- AddForeignKey
ALTER TABLE "ProviderConnection" ADD CONSTRAINT "ProviderConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCredential" ADD CONSTRAINT "AdCredential_providerConnectionId_fkey" FOREIGN KEY ("providerConnectionId") REFERENCES "ProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

