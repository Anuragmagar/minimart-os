-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "goods_receipt_items_receipt_id_idx" ON "goods_receipt_items"("receipt_id");

-- CreateIndex
CREATE INDEX "product_barcodes_product_id_idx" ON "product_barcodes"("product_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "sale_item_allocations_sale_item_id_idx" ON "sale_item_allocations"("sale_item_id");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_return_items_return_id_idx" ON "sale_return_items"("return_id");

-- CreateIndex
CREATE INDEX "unit_conversions_to_unit_id_idx" ON "unit_conversions"("to_unit_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- BR-006 projection integrity: exactly one balance row per (location, product, batch),
-- NULL-safe so a product without a batch still gets a single unbatchable stock line.
CREATE UNIQUE INDEX "inventory_balances_location_product_batch_key"
  ON "inventory_balances"("location_id", "product_id", COALESCE("batch_id", '00000000-0000-0000-0000-000000000000'));

-- BR-016 negative stock is disabled by default: check the projected stock columns.
ALTER TABLE "inventory_balances"
  ADD CONSTRAINT "inventory_balances_non_negative"
  CHECK ("quantity_on_hand" >= 0 AND "reserved" >= 0 AND "available" >= 0);
