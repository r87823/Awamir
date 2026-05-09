-- CreateEnum
CREATE TYPE "ERPNextSyncOperation" AS ENUM ('VALIDATE_CONNECTION', 'CREATE_SALES_ORDER', 'CREATE_DRAFT_SALES_INVOICE', 'SUBMIT_SALES_INVOICE', 'CREATE_DRAFT_PAYMENT_ENTRY', 'SUBMIT_PAYMENT_ENTRY');

-- CreateEnum
CREATE TYPE "ERPNextSyncStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "erpnext_integration_configs" (
    "id" UUID NOT NULL,
    "base_url" VARCHAR(500) NOT NULL,
    "api_key" VARCHAR(255) NOT NULL,
    "api_secret_ref" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_validated_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erpnext_integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erpnext_sync_logs" (
    "id" UUID NOT NULL,
    "outbox_id" UUID,
    "operation" "ERPNextSyncOperation" NOT NULL,
    "status" "ERPNextSyncStatus" NOT NULL,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error_code" VARCHAR(120),
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erpnext_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_outbox" (
    "id" UUID NOT NULL,
    "operation" "ERPNextSyncOperation" NOT NULL,
    "idempotency_key" VARCHAR(220) NOT NULL,
    "source_type" VARCHAR(80) NOT NULL,
    "source_id" VARCHAR(120) NOT NULL,
    "payload" JSONB,
    "status" "ERPNextSyncStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "erpnext_doctype" VARCHAR(120),
    "erpnext_name" VARCHAR(160),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erpnext_integration_configs_is_active_idx" ON "erpnext_integration_configs"("is_active");

-- CreateIndex
CREATE INDEX "erpnext_sync_logs_outbox_id_idx" ON "erpnext_sync_logs"("outbox_id");

-- CreateIndex
CREATE INDEX "erpnext_sync_logs_status_idx" ON "erpnext_sync_logs"("status");

-- CreateIndex
CREATE INDEX "erpnext_sync_logs_operation_idx" ON "erpnext_sync_logs"("operation");

-- CreateIndex
CREATE UNIQUE INDEX "integration_outbox_idempotency_key_key" ON "integration_outbox"("idempotency_key");

-- CreateIndex
CREATE INDEX "integration_outbox_status_next_retry_at_idx" ON "integration_outbox"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "integration_outbox_operation_idx" ON "integration_outbox"("operation");

-- CreateIndex
CREATE INDEX "integration_outbox_source_type_source_id_idx" ON "integration_outbox"("source_type", "source_id");

-- AddForeignKey
ALTER TABLE "erpnext_sync_logs" ADD CONSTRAINT "erpnext_sync_logs_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "integration_outbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
