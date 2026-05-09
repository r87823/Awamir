-- CreateEnum
CREATE TYPE "CashboxStatus" AS ENUM ('OPEN', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'RETURNED', 'CLOSED');

-- AlterTable
ALTER TABLE "pending_cashbox_entries" ADD COLUMN     "cashbox_id" UUID;

-- CreateTable
CREATE TABLE "cashboxes" (
    "id" UUID NOT NULL,
    "collector_user_id" VARCHAR(160) NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "CashboxStatus" NOT NULL DEFAULT 'OPEN',
    "expected_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "collected_cash" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "notes" TEXT,
    "return_reason" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "returned_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashboxes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cashboxes_business_date_status_idx" ON "cashboxes"("business_date", "status");

-- CreateIndex
CREATE INDEX "cashboxes_collector_user_id_status_idx" ON "cashboxes"("collector_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cashboxes_collector_user_id_business_date_key" ON "cashboxes"("collector_user_id", "business_date");

-- CreateIndex
CREATE INDEX "pending_cashbox_entries_cashbox_id_status_idx" ON "pending_cashbox_entries"("cashbox_id", "status");

-- AddForeignKey
ALTER TABLE "pending_cashbox_entries" ADD CONSTRAINT "pending_cashbox_entries_cashbox_id_fkey" FOREIGN KEY ("cashbox_id") REFERENCES "cashboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
