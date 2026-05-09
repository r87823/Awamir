-- CreateEnum
CREATE TYPE "DeliveryBatchStatus" AS ENUM ('CREATED', 'DRIVER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DeliveryStatus" ADD VALUE 'ADDED_TO_DELIVERY_BATCH';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "destination_branch_id" UUID;

-- CreateTable
CREATE TABLE "delivery_batches" (
    "id" UUID NOT NULL,
    "batch_number" VARCHAR(50) NOT NULL,
    "destination_branch_id" UUID NOT NULL,
    "status" "DeliveryBatchStatus" NOT NULL DEFAULT 'CREATED',
    "driver_id" VARCHAR(160),
    "idempotency_key" VARCHAR(260) NOT NULL,
    "assigned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "delivery_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_batch_orders" (
    "id" UUID NOT NULL,
    "delivery_batch_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_batch_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_batches_batch_number_key" ON "delivery_batches"("batch_number");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_batches_idempotency_key_key" ON "delivery_batches"("idempotency_key");

-- CreateIndex
CREATE INDEX "delivery_batches_destination_branch_id_status_idx" ON "delivery_batches"("destination_branch_id", "status");

-- CreateIndex
CREATE INDEX "delivery_batches_driver_id_status_idx" ON "delivery_batches"("driver_id", "status");

-- CreateIndex
CREATE INDEX "delivery_batch_orders_delivery_batch_id_idx" ON "delivery_batch_orders"("delivery_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_batch_orders_delivery_batch_id_order_id_key" ON "delivery_batch_orders"("delivery_batch_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_batch_orders_order_id_key" ON "delivery_batch_orders"("order_id");

-- CreateIndex
CREATE INDEX "orders_destination_branch_id_delivery_status_idx" ON "orders"("destination_branch_id", "delivery_status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_destination_branch_id_fkey" FOREIGN KEY ("destination_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_batches" ADD CONSTRAINT "delivery_batches_destination_branch_id_fkey" FOREIGN KEY ("destination_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_batch_orders" ADD CONSTRAINT "delivery_batch_orders_delivery_batch_id_fkey" FOREIGN KEY ("delivery_batch_id") REFERENCES "delivery_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_batch_orders" ADD CONSTRAINT "delivery_batch_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
