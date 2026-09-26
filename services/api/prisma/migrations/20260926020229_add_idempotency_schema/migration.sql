-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID,
    "user_id" UUID,
    "operation_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "response_status" INTEGER,
    "response_body" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_records_organization_id_expires_at_idx" ON "idempotency_records"("organization_id", "expires_at");

-- CreateIndex
CREATE INDEX "idempotency_records_operation_key_created_at_idx" ON "idempotency_records"("operation_key", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_organization_id_operation_key_key" ON "idempotency_records"("organization_id", "operation_key");
