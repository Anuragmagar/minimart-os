# MiniMart OS — Business Rules

BR-001 Every business belongs to an Organization.
BR-002 Operational transactions belong to a Store.
BR-003 Products belong to an Organization.
BR-004 Inventory belongs to a Store/Inventory Location.
BR-005 Every inventory quantity change creates InventoryMovement.
BR-006 InventoryBalance is a projection of movements.
BR-007 Posted financial/inventory records cannot be directly edited.
BR-008 Sales preserve historical snapshots.
BR-009 A return cannot exceed remaining returnable quantity.
BR-010 Purchase order does not increase inventory.
BR-011 Goods receipt increases inventory.
BR-012 Supplier return decreases inventory and reverses applicable supplier balance.
BR-013 Customer return increases inventory only when condition allows it.
BR-014 Damage creates inventory-loss movement.
BR-015 Expired stock cannot be sold.
BR-016 Negative stock is disabled by default.
BR-017 Physical batch allocation uses FEFO.
BR-018 Financial inventory valuation uses Weighted Average Cost.
BR-019 COGS is captured when a sale completes.
BR-020 Sales discounts reduce revenue, not inventory cost.
BR-021 Credit sale creates customer receivable.
BR-022 Credit purchase creates supplier payable.
BR-023 Only cash payments affect physical cash drawer balance.
BR-024 Retrying an operation must not duplicate it.
BR-025 Users can only access authorized organizations/stores.
BR-026 Backend permissions are authoritative.
BR-027 Important mutations create audit records.
BR-028 Sale completion is atomic.
BR-029 Goods receipt is atomic.
BR-030 Return processing is atomic.
BR-031 Payment posting is atomic.
BR-032 A register may have only one active cash session.
BR-033 Customer ledger is auditable.
BR-034 Supplier ledger is auditable.
BR-035 Historical sales do not change when prices change.
BR-036 Tax behavior is configurable and effective-dated.
BR-037 Offline POS commands receive client-generated operation IDs.
BR-038 Server processes each operation ID at most once.
BR-039 Normal users cannot modify/delete audit records.
BR-040 One organization must never access another organization's data.
