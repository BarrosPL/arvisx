-- AlterTable
ALTER TABLE "AdMetricSnapshot" ADD COLUMN     "adStatus" TEXT,
ADD COLUMN     "cpm" DECIMAL(10,2),
ADD COLUMN     "frequency" DECIMAL(6,2),
ADD COLUMN     "reach" INTEGER;
