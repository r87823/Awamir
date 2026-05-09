-- CreateEnum
CREATE TYPE "DeliveryBatchOrderStatus" AS ENUM ('ADDED_TO_BATCH', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryBatchStatus" ADD VALUE 'PICKED_UP';
ALTER TYPE "DeliveryBatchStatus" ADD VALUE 'PARTIALLY_DELIVERED';
ALTER TYPE "DeliveryBatchStatus" ADD VALUE 'RETURNED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryStatus" ADD VALUE 'PICKED_UP';
ALTER TYPE "DeliveryStatus" ADD VALUE 'RETURNED';

-- AlterTable
ALTER TABLE "delivery_batch_orders" ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "delivery_notes" TEXT,
ADD COLUMN     "received_by_name" VARCHAR(160),
ADD COLUMN     "return_notes" TEXT,
ADD COLUMN     "return_reason_code" VARCHAR(80),
ADD COLUMN     "returned_at" TIMESTAMP(3),
ADD COLUMN     "status" "DeliveryBatchOrderStatus" NOT NULL DEFAULT 'ADDED_TO_BATCH';

-- CreateIndex
CREATE INDEX "delivery_batch_orders_status_idx" ON "delivery_batch_orders"("status");
