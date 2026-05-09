-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductionStatus" ADD VALUE 'DELAYED';
ALTER TYPE "ProductionStatus" ADD VALUE 'REJECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkOrderStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "WorkOrderStatus" ADD VALUE 'IN_PRODUCTION';
ALTER TYPE "WorkOrderStatus" ADD VALUE 'DELAYED';
ALTER TYPE "WorkOrderStatus" ADD VALUE 'READY';
ALTER TYPE "WorkOrderStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "accepted_at" TIMESTAMP(3),
ADD COLUMN     "delay_reason_code" VARCHAR(80),
ADD COLUMN     "delayed_at" TIMESTAMP(3),
ADD COLUMN     "ready_at" TIMESTAMP(3),
ADD COLUMN     "reject_reason_code" VARCHAR(80),
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "status_notes" TEXT;
