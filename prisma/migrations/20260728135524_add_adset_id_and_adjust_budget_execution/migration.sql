-- AlterEnum
ALTER TYPE "ExecutionAction" ADD VALUE 'ADJUST_BUDGET';

-- AlterTable
ALTER TABLE "AdMetricSnapshot" ADD COLUMN     "platformAdSetId" TEXT;
