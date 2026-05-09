-- AddEnumValue
ALTER TYPE "ERPNextSyncStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';

-- ReplaceEnum AccountingStatus with data mapping
CREATE TYPE "AccountingStatus_new" AS ENUM (
  'NOT_POSTED',
  'SALES_ORDER_PENDING_SYNC',
  'SALES_ORDER_CREATED',
  'DRAFT_INVOICE_PENDING_SYNC',
  'DRAFT_INVOICE_CREATED',
  'INVOICE_SUBMITTED',
  'PAYMENT_PENDING_SYNC',
  'PAYMENT_SUBMITTED',
  'ACCOUNTING_POSTED',
  'SYNC_FAILED'
);

ALTER TABLE "orders" ALTER COLUMN "accounting_status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "accounting_status" TYPE "AccountingStatus_new"
USING (
  CASE "accounting_status"::text
    WHEN 'NOT_SYNCED' THEN 'NOT_POSTED'
    WHEN 'SYNC_PENDING' THEN 'SALES_ORDER_PENDING_SYNC'
    WHEN 'SYNCED' THEN 'ACCOUNTING_POSTED'
    ELSE "accounting_status"::text
  END
)::"AccountingStatus_new";
ALTER TYPE "AccountingStatus" RENAME TO "AccountingStatus_old";
ALTER TYPE "AccountingStatus_new" RENAME TO "AccountingStatus";
DROP TYPE "AccountingStatus_old";
ALTER TABLE "orders" ALTER COLUMN "accounting_status" SET DEFAULT 'NOT_POSTED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "erpnext_sales_order_id" VARCHAR(160),
ADD COLUMN "erpnext_sales_invoice_id" VARCHAR(160),
ADD COLUMN "sales_order_reviewed_at" TIMESTAMP(3),
ADD COLUMN "sales_order_reviewed_by" VARCHAR(160),
ADD COLUMN "invoice_reviewed_at" TIMESTAMP(3),
ADD COLUMN "invoice_reviewed_by" VARCHAR(160);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "erpnext_payment_entry_id" VARCHAR(160),
ADD COLUMN "reviewed_at" TIMESTAMP(3),
ADD COLUMN "reviewed_by" VARCHAR(160);

-- AlterTable
ALTER TABLE "integration_outbox" ADD COLUMN "last_attempt_at" TIMESTAMP(3),
ADD COLUMN "correlation_id" VARCHAR(160);

-- AlterTable
ALTER TABLE "erpnext_sync_logs" ADD COLUMN "correlation_id" VARCHAR(160);

-- CreateTable
CREATE TABLE "financial_day_closes" (
  "id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "closed_by_actor_id" VARCHAR(160),
  "total_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total_payments" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "approved_cashboxes_count" INTEGER NOT NULL DEFAULT 0,
  "pending_cashboxes_count" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "financial_day_closes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_accounting_status_created_at_idx" ON "orders"("accounting_status", "created_at");

-- CreateIndex
CREATE INDEX "payments_reviewed_at_idx" ON "payments"("reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "financial_day_closes_business_date_key" ON "financial_day_closes"("business_date");
