-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryStatus" ADD VALUE 'READY_FOR_PACKING';
ALTER TYPE "DeliveryStatus" ADD VALUE 'WAITING_BATCH';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "packing_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workflow_settings_snapshot" JSONB;
