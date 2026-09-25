# MiniMart OS — Engineering Brain

## Product
MiniMart OS is a Nepal-focused retail management and POS platform.

Initial deployment: one physical mini-mart.
Future: multi-store retail platform.

Core workflow:
Purchase → Receive → Stock → Sell → Payment → Invoice → Reports → Profit

Supporting workflows:
Suppliers, Customers, Khata, Expenses, Returns, Stock Adjustments, Cash, Tax, Audit.

## Product Principles
The system must be reliable, offline-capable, auditable, maintainable, secure, fast at POS, multi-store ready, and financially/inventory consistent.

## MVP
Organization, stores, registers, users, roles, permissions, products, categories, brands, units, barcodes, pricing, tax configuration, inventory, batches, expiry, FEFO, purchasing, suppliers, POS, cash/card/bank/QR/credit, split payments, customers, Khata, returns, expenses, cash register, reports, audit, offline POS, sync, invoice/receipt, backup, hardware, security.

## Deferred
AI forecasting, AI recommendations, payroll, advanced accounting, customer mobile app, supplier portal, ecommerce, delivery, marketplace integrations, advanced loyalty, microservices, Kubernetes, multi-country taxation.

## Technology
Proposed: Flutter, BLoC/Cubit, GoRouter, GetIt, Injectable, Drift, SQLite, Dio, Freezed/JSON serialization, NestJS, TypeScript, PostgreSQL, Prisma, Redis, REST, Docker.

These choices must pass the Foundation compatibility review before being considered locked.

## Architecture
Modular monolith. Separate Flutter application and NestJS API. POS is offline-first. Server is centralized source of truth after synchronization.

## Core Domain
Organization → Store → Register → Inventory Location.
Organization → Users → Roles → Permissions.
Organization → Products → Categories → Brands → Units → Prices → Tax Categories.
Store → Inventory → Purchases → Sales → Cash Sessions.
Supplier → Purchases → Payables.
Customer → Sales → Receivables.

## Inventory
InventoryMovement is authoritative history. InventoryBalance is derived state.

## Sales
Sales preserve historical product, pricing, tax, and cost snapshots.

## Payments
Payment is a separate entity. A sale may contain multiple payment records.

## Returns
Returns reference original sales and enforce remaining returnable quantity. Conditions: SELLABLE, DAMAGED, QUARANTINE.

## Purchasing
Purchase order does not increase stock. Goods receipt increases stock. Partial receipt is supported.

## Cash
Expected cash = opening + cash sales + deposits - cash refunds - cash expenses - withdrawals.

## Reporting
Net Sales = Gross Sales - Sales Discounts - Sales Returns.
Gross Profit = Net Sales - COGS.
Estimated Net Profit = Gross Profit - Operating Expenses.

## Hardware
Windows POS target. Barcode scanner, receipt printer, cash drawer. Optional label printer, customer display, weighing scale, UPS.

## Multi-store
Organization → Store → Register → Inventory Location. Future warehouse support must not require a redesign.

## Performance Targets
Local barcode lookup <100 ms target.
Cart update <100 ms target.
Local quantity update <50 ms target.
Local sale near-instant target.

## Authoritative Documents
Business rules: `/brain/BUSINESS_RULES.md`
Architecture: `/brain/ARCHITECTURE.md`
Domain model: `/brain/DOMAIN_MODEL.md`
Security: `/brain/SECURITY.md`
Offline: `/brain/OFFLINE_SYNC.md`
Phase plans: `/plans/`

## Change Policy
Major architecture changes require approval. Business-rule changes must be documented. Security changes must be reviewed. Destructive database changes require explicit review.
