# MiniMart OS — Domain Model

## Organization
id, name, legal_name, PAN/VAT identifiers, contact, address, currency, timezone, status, timestamps.

## Store
organization_id, name, code, address, phone, status.

## Register
store_id, name, code, device_id, status.

## User
organization_id, name, email/phone, password_hash, status, last_login, timestamps.

## RBAC
Role, Permission, UserRole, RolePermission, UserStoreAccess.

## Product
organization_id, category_id, brand_id, unit_id, tax_category_id, name, description, SKU, default purchase price, default selling price, reorder level, reorder quantity, status.

## ProductBarcode
product_id, barcode, barcode_type, is_primary.

## ProductPrice
product_id, price_type, amount, effective_from, effective_to.

## Category
organization_id, parent_id, name, status.

## Brand
organization_id, name, status.

## Unit
organization_id, name, code, precision.

## UnitConversion
from_unit, to_unit, multiplier.

## TaxCategory
name, code, rate, tax_type, effective dates, status.

## InventoryLocation
store_id, name, code, status.

## ProductBatch
product_id, supplier_id, batch_number, manufacture_date, expiry_date, unit_cost.

## InventoryBalance
location_id, product_id, batch_id, quantity_on_hand, reserved, available, version, updated_at.

## InventoryMovement
organization_id, location_id, product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, operation_id, occurred_at, created_by, created_at.

## StockAdjustment
location, reason, status, timestamps, items.

## StockTransfer
source, destination, status, timestamps, items.

## Supplier
organization_id, name, code, PAN/VAT, contact, payment_terms, credit_limit, active.

## PurchaseOrder
supplier, store, status, dates, totals, items.

## GoodsReceipt
purchase order, supplier, store, status, receipt date, items.

## SupplierLedgerEntry
supplier, reference, debit/credit, amount, balance metadata.

## SupplierPayment
supplier, payment method, amount, reference, timestamp.

## Customer
organization_id, name, phone, address, credit_limit, status.

## CustomerLedgerEntry
customer, reference, debit/credit, amount, balance metadata.

## CustomerPayment
customer, payment method, amount, reference, timestamp.

## Sale
organization, store, register, cash session, customer, cashier, sale number, status, totals, operation_id, timestamps.

## SaleItem
sale_id, product, batch optional, historical name/SKU/barcode, quantity, unit price, discount, tax, line total, cost price snapshot, cost total snapshot.

## SaleItemAllocation
sale_item, batch, quantity, unit cost, cost total.

## Payment
organization, sale, method, provider, amount, reference, status, paid_at.

## SaleReturn
original sale, customer, store, status, totals, reason, timestamps.

## SaleReturnItem
return, original sale item, quantity, condition, refund amount.

## Invoice
sale, invoice number, seller/customer snapshots, tax totals, status.

## ExpenseCategory
organization, name, status.

## Expense
store, category, amount, payment method, description, timestamp.

## CashSession
organization, store, register, cashier, opening, expected, actual, variance, status, open/close times.

## CashMovement
cash session, type, amount, reference, timestamp.

## Device
organization, store, register, device identity, status, last sync.

## AuditLog
organization, store, user, device, action, entity, entity ID, before/after data, timestamp.

## SyncOperation
device, operation_id, operation type, payload reference, state, attempts, timestamps.

## Conflict
operation, entity, conflict type, local data, server data, resolution, resolver, timestamps.
