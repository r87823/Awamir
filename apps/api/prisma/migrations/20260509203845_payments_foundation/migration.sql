-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'ONLINE', 'CREDIT');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('DRAFT', 'COLLECTED', 'SUBMITTED_TO_CASHBOX', 'REVIEWED', 'PENDING_ERPNEXT_SYNC', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentCollectionSource" AS ENUM ('BRANCH', 'DELIVERY');

-- CreateEnum
CREATE TYPE "CashboxEntryStatus" AS ENUM ('PENDING', 'SUBMITTED', 'REVIEWED', 'CANCELLED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "remaining_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'COLLECTED',
    "source" "PaymentCollectionSource" NOT NULL,
    "idempotency_key" VARCHAR(260) NOT NULL,
    "collected_by_actor_id" VARCHAR(160),
    "driver_id" VARCHAR(160),
    "notes" TEXT,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_cashbox_entries" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "CashboxEntryStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_cashbox_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_source_collected_by_actor_id_idx" ON "payments"("source", "collected_by_actor_id");

-- CreateIndex
CREATE INDEX "payments_driver_id_idx" ON "payments"("driver_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pending_cashbox_entries_payment_id_key" ON "pending_cashbox_entries"("payment_id");

-- CreateIndex
CREATE INDEX "pending_cashbox_entries_order_id_idx" ON "pending_cashbox_entries"("order_id");

-- CreateIndex
CREATE INDEX "pending_cashbox_entries_status_idx" ON "pending_cashbox_entries"("status");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_cashbox_entries" ADD CONSTRAINT "pending_cashbox_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_cashbox_entries" ADD CONSTRAINT "pending_cashbox_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
