# MiniMart OS ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Assumptions

This file records assumptions made during implementation.

Every assumption requires:
- ID
- date
- task
- assumption
- reason
- impact
- status
- resolution

## Template

### ASM-001
Date: 2026-09-25
Task: 00.01 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Repository Initialization
Assumption: Git repository is initialized with default branch `main`.
Reason: Git was not yet initialized; `main` is the modern default and Task 00.05 CI will target the default branch.
Impact: Repository history starts on `main`. Renaming the branch later is trivial.
Status: active
Resolution:

### ASM-002
Date: 2026-09-25
Task: 00.01 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Repository Initialization
Assumption: Environment templates are provided at repo root (development infrastructure, consumed by root docker-compose) and services/api/.env.example (application-level configuration).
Reason: docker-compose.yml lives at the repository root; the backend service will read application configuration from its own environment.
Impact: Task 00.02 (Docker) and Task 00.03 (Backend Bootstrap) may extend these templates.
Status: active
Resolution:

### ASM-003
Date: 2026-09-25
Task: 00.02 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Docker Development Environment
Assumption: Development container images are pinned to postgres:17-alpine and redis:7-alpine.
Reason: Reproducible dev environment; alpine variants keep image size small. Version selection is a tooling choice, not a business rule.
Impact: If a later phase requires a different PostgreSQL major for a feature, the pin can be bumped via an explicit reviewed change.
Status: active
Resolution:

### ASM-004
Date: 2026-09-25
Task: 00.03 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Backend Bootstrap
Assumption: Backend test and lint tooling uses the NestJS 12 scaffold defaults (Vitest, oxlint, Prettier) rather than Jest/ESLint.
Reason: The scaffold is the current idiomatic NestJS setup; no doc mandates a specific unit test or linter framework.
Impact: CI (Task 00.05) must invoke these scripts. Docs may reference vitest/oxlint going forward.
Status: active
Resolution:

### ASM-005
Date: 2026-09-25
Task: 00.03 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Backend Bootstrap
Assumption: Typed backend configuration is implemented with @nestjs/config plus a typed configuration factory in src/config/configuration.ts.
Reason: AGENTS.md lists configuration as a bootstrap requirement without prescribing a library; @nestjs/config is the standard NestJS approach.
Impact: Later backend tasks (02.01+) may evolve validation and structure of configuration.
Status: active
Resolution:

### ASM-006
Date: 2026-09-25
Task: 00.04 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Flutter Bootstrap
Assumption: Flutter app uses organization `com.minimart` and project/package name `pos` in apps/pos.
Reason: `com.minimart` matches the project's reverse-domain identity intent; `pos` is the short app identifier. No doc prescribed a specific org/project name.
Impact: Package/bundle identifiers (and later platform signing identities) derive from `com.minimart`; renaming later is disruptive, so treat `pos`/`com.minimart` as the app identity unless explicitly changed.
Status: active
Resolution:

### ASM-007
Date: 2026-09-25
Task: 00.04 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Flutter Bootstrap
Assumption: Routing/DI foundation uses the documented stack GoRouter + GetIt + Injectable with generated `injection.config.dart`; BLoC/Cubit, Drift (SQLite), Dio, and Freezed are intentionally deferred to their later phases.
Reason: ARCHITECTURE.md names these technologies; the 00.04 plan limits scope to routing + DI foundation. Injectable 3.x names the config output after the annotated file (`injection.config.dart`).
Impact: Route table and DI registrations will grow in later phases; BLoC providers and repositories get registered through the same container.
Status: active
Resolution:

### ASM-008
Date: 2026-09-25
Task: 00.05 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â CI Foundation
Assumption: CI is implemented as a GitHub Actions workflow in .github/workflows/ci.yml.
Reason: The repository tracks branch `main` and no CI provider is documented anywhere in /brain or /docs; GitHub Actions is the default for Flutter/NestJS monorepos and needs no external account beyond the (future) GitHub remote.
Impact: When the repo is pushed to another CI provider, the workflow must be ported (a small config change). Live CI execution cannot be verified until a remote exists; commands were verified locally instead.
Status: resolved
Resolution: 2026-09-25 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Initial commit pushed to https://github.com/Anuragmagar/minimart-os; CI run 36087189717 executed all three jobs green (Backend 22s, Flutter Windows build 4m31s, Flutter format/analyze/test 1m35s).

### ASM-009
Date: 2026-09-25
Task: 00.06 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Foundation Audit
Assumption: The Task 00.06 audit report (brain/FOUNDATION_AUDIT.md) serves as the Foundation compatibility review referenced by AGENTS.md section 9 ("subject to the Foundation compatibility review before being treated as locked"), and the proposed stack is treated as LOCKED for Phase 01+.
Reason: AGENTS.md defers locking the stack to a compatibility review; this audit verified toolchain health, dependency resolution, builds, tests, and architecture alignment with a PASS verdict, and no other review mechanism is defined.
Impact: Subsequent phases must not silently switch stack components; any change requires a recorded decision (see/docs/decisions/). Follow-up actions (initial commit, GitHub remote, CI activation) remain open.
Status: active
Resolution:

### ASM-010
Date: 2026-09-25
Task: 01.01 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Organization Schema
Assumption: Organization master-data `status` values are exactly `active` and `inactive`, implemented as a PostgreSQL enum column (`OrganizationStatus`) with DB default `active`; `currency` is required with no default value.
Reason: DOMAIN_MODEL lists `status` on Organization but defines no allowed values; a DB-level enum is the most restrictive safe constraint and `active` is the natural creation state. Currency must always be explicit per organization; inventing a default would be an unsupported business rule.
Impact: A third status value requires a reviewed migration. New master entities should reuse the same status-pattern (or an explicit decision to differ).
Status: active
Resolution:

### ASM-011
Date: 2026-09-25
Task: 01.01 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Organization Schema
Assumption: Database access follows Prisma 7 (7.10.0) conventions: prisma7.config.ts with dotenv, `prisma-client` generator emitting to src/generated/prisma (gitignored, regenerated via postinstall/npm run prisma:generate), migrations under prisma/migrations applied by `prisma migrate dev`/`deploy`, snake_case DB identifiers via @map/@@map, and a dedicated integration test database `minimart_test` provisioned on the fly by test/db suites.
Reason: Prisma 7 is the current major and its v7 generator/client + @prisma/adapter-pg runtime pattern was validated (schema valid, migrations applied, client constructs over the driver adapter). docs/DATABASE_CONVENTIONS.md mandates snake_case identifiers.
Impact: Later schema tasks (01.02+) follow the same generator/config/test pattern; test/db requires a reachable PostgreSQL. Prisma 7's `migrate dev` does not auto-generate the client; npm run prisma:generate must be run after schema edits.
Status: active
Resolution:

### ASM-012
Date: 2026-09-25
Task: 01.02 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Store Schema
Assumption: Register.device_id is a nullable UUID column with no foreign key constraint until the devices table exists (Task 01.11); the FK will be added when Device is created (or during Task 01.12 constraints).
Reason: DOMAIN_MODEL.md lists device_id on Register, but the Device entity is defined later (01.11 Audit/Sync Schema). A dangling FK cannot be created before its parent table exists, so the pending link is explicitly recorded rather than invented.
Impact: Task 01.11 or 01.12 must add the REFERENCES constraint. Until then device_id is unconstrained at the DB level (application must treat it as a soft reference).
Status: resolved
Resolution: Task 01.11 created devices and added `registers_device_id_key` (UNIQUE) plus `registers_device_id_fkey` (RESTRICT) in migration add_audit_sync_schema; the registerÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã‚Âdevice link is now bidirectional via `devices.register_id` (1:1, ASM-023e).

### ASM-013
Date: 2026-09-25
Task: 01.03 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â User/RBAC Schema
Assumption: (a) User login identifiers are separate nullable `email` and `phone` columns, each globally unique; requiring at least one of them is enforced by the application/auth layer, not by a DB CHECK (no documented business rule defines the rule). (b) Role is organization-scoped (unique organization_id + code); Permission is a global catalog (globally unique code).
Reason: DOMAIN_MODEL lists "email/phone" without a shape for user login; email and phone both as optional columns with DB-level uniqueness is the least-restrictive model consistent with Nepal mini-mart staffing (phone logins). BRAIN.md ("Organization ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Users ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Roles ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Permissions") plus BR-025/BR-026 and tenancy imply org-scoped roles; permission codes (SECURITY.md examples) are shared application-level codes.
Impact: Registration logic must require email or phone. Cross-organization identity sharing (same email in two organizations) is intentionally blocked because email/phone are globally unique. Permission seeding (Task 01.13) should follow the SECURITY.md code format `domain:action`.
Status: active
Resolution:

### ASM-014
Date: 2026-09-25
Task: 01.04 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Product Schema
Assumption: (a) Product parent references (category_id, brand_id, unit_id), money fields (default_purchase_price, default_selling_price), reorder fields, and description are nullable; the application layer requires them where a business rule needs them. (b) products.tax_category_id is a nullable scalar column now; its FK is added in Task 01.05 together with the TaxCategory table (same pattern as ASM-012). (c) product_barcodes denormalizes organization_id so a barcode value is unique within an organization (DATABASE_CONVENTIONS "product barcodes within organization"); exactly one primary barcode per product is application-enforced because Prisma cannot express partial unique indexes. (d) unit_conversions.multiplier is DECIMAL(14,6) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â no convention covers conversion factors, so precision 6 is chosen (money=2, quantity=3, multiplier can be fractional). (e) scoped-name uniqueness (category/brand name per organization; unit code per organization) follows the established scoped-identifier pattern from DATABASE_CONVENTIONS.
Reason: DOMAIN_MODEL omits types/nullability for these fields; the least-restrictive schema avoids inventing business rules while the conventions supply scoping/uniqueness guidance. ProductPrice (price periods) is explicitly Task 01.05, so product defaults here are just master-data defaults.
Impact: App/product service must enforce required parents, primary-barcode rules, and at-least-one-price before selling. Measurement/precision behavior of quantities is governed by unit.precision at the application layer.
Status: active
Resolution:

### ASM-015
Date: 2026-09-25
Task: 01.05 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Pricing and Tax Schema
Assumption: (a) TaxCategory is organization-scoped (organization_id NOT NULL, unique (org, code)) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â DOMAIN_MODEL omits organization_id on TaxCategory, but BR-036 (tax behavior configurable and effective-dated) and the tenancy convention make it org config; a global catalog would let one organization's rate changes leak into another's products (BR-040). (b) Each TaxCategory row is a single effective-dated definition (effective_from required, effective_to optional); rate changes edit the row and are captured by the audit log (01.11/01.15), while sales snapshot the rate at sale time, so historical correctness does not depend on versioned rate rows. (c) tax_categories.rate is DECIMAL(14,4) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â tax rates can be fractional and existing conventions cover money (2) and quantity (3) only; 4 decimals chosen for rates. (d) tax_type and product_prices.price_type are free TEXT, not enums ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â no authoritative value list exists (AGENTS never invents enum values). (e) ProductPrice has no status and no period-overlap constraint; a price period is retired by effective_to and overlap conflicts (same product+price_type+period) are application-enforced because Prisma cannot express exclusion constraints. No uniqueness on (product, price_type) so a product's price history is preserved.
Reason: DOMAIN_MODEL lists TaxCategory without org and ProductPrice without status/constraints; the chosen shapes follow the governing conventions (tenancy, effective-dated config, snapshots for immutable records) while staying least-restrictive where no rule exists.
Impact: TaxCategory/ProductPrice services must validate effective windows (effective_to > effective_from) and disallow overlapping active periods. Creating TaxCategory seeds (e.g. Nepal VAT) is deferred to Task 01.13; no rate values are assumed here.
Status: active
Resolution:

### ASM-016
Date: 2026-09-25
Task: 01.06 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Inventory Schema
Assumption: product_batches.supplier_id is a nullable scalar column now; its FK (RESTRICT) is added in Task 01.07 when the Supplier table is created (same deferral pattern as ASM-012/ASM-014). ProductBatch always belongs to a product (product_id NOT NULL); batch_number is NOT unique at the DB level because two suppliers may issue identical batch numbers and no rule defines scoped uniqueness.
Reason: DOMAIN_MODEL lists supplier_id on ProductBatch, but Task 01.06 runs before Task 01.07 (Purchasing/Suppliers); the established deferred-FK pattern keeps migrations safe.
Impact: Batch receiving will link supplier once 01.07 lands; until then supplier_id stays NULL on DB insert.
Status: resolved
Resolution: Task 01.07 added the suppliers table and `product_batches_supplier_id_fkey` (RESTRICT) in migration add_purchase_schema; supplier_id is now linked.

### ASM-018
Date: 2026-09-25
Task: 01.07 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Purchasing Schema
Assumption: (a) purchase_orders.status and goods_receipts.status are free TEXT, not enums ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â the authoritative draft/ordered/received/etc. value lists are undocumented (AGENTS never invents enum values); the application layer defines workflow codes. (b) PurchaseOrder money columns (sub_total/discount_amount/tax_amount/total) are order-time snapshots computed by the application; the DB only stores them (TRANSAXION atomicity is handled at use-case level). (c) SupplierLedgerEntry.entry_type is TEXT ('debit'/'credit' semantics are application-verified; debit increases supplier receivable, credit decreases it); balance_after snapshot columns are app-maintained. (d) There is no purchase order number field ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â document identity is the UUID id; any bill/receipt number for Nepal compliance is configured later via the reference field or a future compliance task. (e) SupplierPayment has no organization_id: suppliers are org-scoped and payment links the supplier only, per DOMAIN_MODEL.
Reason: DOMAIN_MODEL omits status enums, PO numbering, entry_type enums, and org columns on purchasing transactions; no authoritative source defines these.
Impact: Purchasing use cases own status transitions, total computation, and ledger balance maintenance; schema remains a thin, extensible store.
Status: active
Resolution:

### ASM-017
Date: 2026-09-25
Task: 01.06 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Inventory Schema
Assumption: (a) InventoryMovement.quantity is a SIGNED NUMERIC(14,3) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â positive = inbound, negative = outbound; DOMAIN_MODEL lists quantity without sign semantics. (b) movement_type, stock_adjustments.status and stock_transfers.status are free TEXT, not enums ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â the authoritative value lists are undocumented (AGENTS never invents enum values); the application enforcement defines allowed workflow codes (e.g., receipt/sale/adjustment/transfer types and draft/pending/approved/rejected/completed statuses). (c) InventoryBalance.batch_id is nullable to support both product-level balances (NULL) and batch-level balances; a uniqueness rule (location, product, batch) cannot be a DB unique index because NULL batch would let duplicates slip through ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â balance identity is application-managed. reserved/available are projection columns with default 0. (d) InventoryMovement denormalizes organization_id (per DOMAIN_MODEL) and created_by references users RESTRICT but is nullable (system-originated movements have no actor). (e) StockAdjustment/StockTransfer rows carry their own status; executing them creates InventoryMovement rows (BR-005) at the application layer, and item quantities are signed.
Reason: BR-004/BR-005/BR-006 (ledger is authoritative, balance is a projection) require signed movements and a mutable projection; DOMAIN_MODEL does not define sign conventions, status value lists, or balance-batch semantics.
Impact: Movement postings, FEFO picking and the balance-rebuild service must respect sign conventions and app-managed statuses/balance identity. `version` on balances enables optimistic locking.
Status: active
Resolution:

### ASM-019
Date: 2026-09-25
Task: 01.08 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Customer Schema
Assumption: Customer carries an org-scoped `code` with DB unique constraint (organization_id, code), even though DOMAIN_MODEL lists only organization_id, name, phone, address, credit_limit, status. Code is used because every other org-scoped master entity (store, supplier, product, tax category) follows the same (org, code) identity pattern and khata needs a stable business identifier for receipts/ledger references.
Reason: DOMAIN_MODEL omits a customer code but does not forbid one; the org-scoped unique-code convention is already established in this schema (ASM-006/ASM-014 pattern).
Impact: Customer addressing in sales (Task 01.09), khata ledger and offline sync uses the code; name-only matching would be ambiguous.
Status: active
Resolution:

### ASM-020
Date: 2026-09-25
Task: 01.09 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Sales Schema
Assumption: sales.cash_session_id is a nullable scalar column with NO FK now; its FK (RESTRICT) is added in Task 01.10 when the cash_sessions table is created (same deferral pattern as ASM-012/ASM-014/ASM-016). DOMAIN_MODEL lists "cash session" on Sale but the cash schema runs after the sales schema.
Reason: Prisma cannot create an FK to a non-existent table; run order forces the deferral.
Impact: Sales created before 01.10 have no cash-session link; the FK is linked additively in the next task.
Status: resolved
Resolution: Task 01.10 created cash_sessions and added `sales_cash_session_id_fkey` (RESTRICT) in migration add_expense_cash_schema; sales now link to their session.

### ASM-022
Date: 2026-09-25
Task: 01.10 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Expense/Cash Schema
Assumption: (a) cash_session.status, cash_movement.type and expense.payment_method are free TEXT ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â value lists are undocumented; the application layer defines workflow codes. The literal status string 'open' is RESERVED for an active session: a hand-written partial unique index `cash_sessions_register_open_key` (UNIQUE on register_id WHERE status='open') enforces BR-032 (one active session per register) at the database level. (b) CashSession money columns (opening/expected/actual/variance) are DECIMAL(14,2) snapshots computed at open/close by the application; expected = opening + cash in ÃƒÆ’Ã‚Â¢Ãƒâ€¹Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ cash out ÃƒÆ’Ã‚Â¢Ãƒâ€¹Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ refunds (per BR-023 only cash affects the drawer). (c) expense.occurred_at and cash_movement.occurred_at carry local device time for offline capture; no org column on expenses (DOMAIN_MODEL omits it; org reachable via store) while cash_sessions denormalize organization_id per DOMAIN_MODEL. (d) cash_sessions.cashier_id is nullable (system-open sessions allowed); closing sets actual summing cash movements app-side.
Reason: BR-032 mandates single active session but the status value list is undefined; DOMAIN_MODEL omits expense org, movement types, and status enums.
Impact: The cash-close service must use status 'open' for active sessions or the partial index (and BR-032) is bypassed; expense/cash movement types are documented in application code.
Status: active
Resolution:

### ASM-021
Date: 2026-09-25
Task: 01.09 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Sales Schema
Assumption: (a) sale.status, payment.status, sale_return.status and invoice.status are free TEXT, not enums ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â value lists are undocumented (AGENTS never invents enum values); the application layer defines workflow codes (e.g., created/paid/voided, pending/captured/refunded, completed/cancelled, issued/cancelled). (b) sales.operation_id and sale_returns.operation_id are NOT NULL UNIQUE because BR-038 (server processes each operation ID at most once) is enforced at the row level for these single-row-per-operation documents, unlike inventory_movements where one operation fans out to many rows (plain index, ASM-017d). operation_id is client-generated per BR-037. (c) sale.sale_number and invoice.invoice_number are NOT NULL but NOT unique ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â numbering rules are undocumented (per-store/register sequences, fiscal-year resets, compliance formats); uniqueness is application-managed per store with conflict retry, mirroring ASM-016 batch numbers. (d) SaleItem snapshots name/sku/barcode + unit_cost/cost_total per BR-008/BR-019; discount_amount and tax_amount on sale/sale_item are order-time snapshots of DECIMAL(14,2). (e) Payment denormalizes organization_id per DOMAIN_MODEL but not store (reachable via sale). (f) SaleReturn.sale_id is nullable per DOMAIN_MODEL ("original sale" optional) so returns without an original sale are allowed, mirroring goods_receipts.purchase_order_id; SaleReturnItem.sale_item_id is likewise nullable. (g) Invoice carries seller/customer TEXT snapshots and DECIMAL(14,2) tax totals, status TEXT.
Reason: BR-028/BR-030/BR-031 require atomic, idempotent, snapshot-preserving sale/return/refund documents; DOMAIN_MODEL omits status enums, numbering schemes and nullability.
Impact: Sale/return/invoice services own numbering, status transitions, and total computation; DB guarantees idempotency via unique operation ids and immutability via RESTRICT.
Status: active
Resolution:

### ASM-023
Date: 2026-09-25
Task: 01.11 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Audit/Sync Schema
Assumption: (a) Device.status is free TEXT defaulting to 'active' ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â the device state/value list is undocumented; identity is `name` + `device_type` + unique register link. last_online_at/last_sync_at drive OFFLINE_SYNC monitoring (pending/failed/conflict counts are computed from sync_operations, not stored). (b) AuditLog.organization_id is required, but store/user/device are nullable because AGENTS 25 says "store where applicable" (org-level/system actions exist); action, entity and entity_id are TEXT ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â entity_id must accept non-UUID identifiers for heterogeneous entities so it deliberately has NO uuid typing and NO FK; before/after are nullable Json (jsonb) diffs. AuditLog has NO updated_at and no update path (BR-007/BR-039 immutability). (c) SyncOperation.state values are the documented OFFLINE_SYNC tokens stored verbatim (PENDING/SYNCING/APPLIED/FAILED/RETRY/CONFLICT/MANUAL_RESOLUTION/REJECTED), TEXT default 'PENDING'; operation_id is NOT NULL UNIQUE (BR-038 idempotency, same pattern as ASM-021b) and is client-generated (BR-037); payload_ref is a TEXT reference to stored operation payload (domain id or blob key); attempts Int default 0 at DB level; last_error TEXT records the retry reason. (d) Conflict has exactly one row per sync operation (@unique), local_data/server_data are NOT NULL jsonb snapshots, resolution TEXT nullable, resolver = User nullable (allows the OFFLINE_SYNC automated "server wins" path) with resolved_at timestamp. (e) DeviceÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂRegister is a bidirectional 1:1 enforced by TWO FKs: registers.device_id ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ devices (closes ASM-012) and devices.register_id ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ registers; the application must keep both paths consistent.
Reason: OFFLINE_SYNC.md documents the state machine and BR-038 the idempotency keying; DOMAIN_MODEL does not fix status value lists, auditnullability, payload references, or how the two register/device FKs interact.
Impact: Sync service owns state transitions and payload storage; audit service owns diffs; any new sync state must extend the documented token list. Device/register linking is set once at device enrollment.
Status: active
Resolution:

### ASM-024
Date: 2026-09-25
Task: 01.12 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Constraints and Indexes
Assumption: (a) BR-016 ("negative stock handling is disabled by default") is interpreted as: the inventory_balances projection must never go negative, enforced by a database CHECK constraint `inventory_balances_non_negative` (quantity_on_hand/reserved/available >= 0) in the migration SQL (raw SQL, not Prisma-level, matching the BR-032 one-open-session index precedent). Re-enabling negative stock later is possible only via a reviewed additive migration that drops this constraint. (b) BR-006 "exactly one balance per location/product/batch" is enforced by a hand-written NULL-safe UNIQUE index `inventory_balances_location_product_batch_key` on (location_id, product_id, COALESCE(batch_id, '00000000-0000-0000-0000-000000000000')) so the unbatchable per-product line (NULL batch) and every batch-level line share one unique dimension; Prisma `migrate diff` does not emit the index because it is raw SQL (verified: the 01.11 partial index generated no DROP). (c) Ten child-side FK columns got plain @@index (non-unique): categories.parent_id, user_roles.role_id, role_permissions.permission_id, unit_conversions.to_unit_id, product_barcodes.product_id, purchase_order_items.purchase_order_id, goods_receipt_items.receipt_id, sale_items.sale_id, sale_item_allocations.sale_item_id, sale_return_items.return_id ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â so CASCADE parent deletes traverse child indexes; these are additive and do not alter semantics.
Reason: BR-016 leaves negative-stock handling as a configurable policy with a default; BR-006 prescribes a single projection row per dimension which NULL batch would otherwise duplicate; the plan's objective is structural integrity indexes.
Impact: Inventory services must never write negative projections (any such write is rejected by the DB); creating a second balance row for the same (location, product, batch) or for the same product's unbatchable line is rejected; app code may rely on unique lookups by the composite.
Status: active
Resolution:

### ASM-025
Date: 2026-09-25
Task: 01.13 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Seed Data
Assumption: The development seed (services/api/prisma/seed.ts, `npm run seed` / `npx prisma db seed`) is DEV-ONLY reference + demo master data and deliberately contains NO financial/ledger rows: no inventory_balances, no inventory_movements, no sales/payments/cash sessions/expense documents, no ledger entries, no purchase orders/receipts ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â seeding balances without movements would falsify the BR-005/BR-014 ledger, so receiving (ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ movements + balances + batches) belongs to the purchasing/inventory application. (a) Permission catalog = exactly the 20 codes documented in brain/SECURITY.md (global catalog per ASM-013, `domain:action`, no invented codes); the demo mappings owner=all 20, manager=17 (excludes users:manage/roles:manage), cashier=8 (sales/inventory-view/customers-view/cash/reports-sales) are demo defaults the RBAC task (04.06/04.07) owns. (b) Tax seed VAT-STD: rate 13.0000, tax_type 'VAT', effective_from 2005-01-14 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â the standard single rate in force since 14 Jan 2005 under VAT Act 2052 ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§7(1) and unchanged into FY 2083/84 (Finance Bill 2083 keeps 13% standard and adds 5% carve-outs for ride-hailing/electricity from 17 Jul 2026); verified against authoritative sources on 2026-09-25. Seed row is DATA, not business logic (AGENTS 24); rate changes must be data-driven. (c) Demo users use scrypt (node:crypto, parameters 16384/8/1, 32-byte key, fixed dev salt) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â NOT plaintext and never MD5/SHA1 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â but the production password algorithm remains the auth task's choice (ASM-013); dev password `MinimartDev@123` is printed on seed run and is local-only; demo emails use the reserved `.local` TLD so they never collide with real identities. (d) product_prices.price_type literal 'retail' for seeded prices follows ASM-014d (application-defined tokens); batch numbers `BATCH-<SKU>-001` and demo phone numbers/PAN-less org are invented dev data with no real-world references. (e) Idempotency: every row upserts on its natural key (permissions.code, (org,code) where org-scoped, (org,sku) products, (org,email) users); org/store/registers use fixed seed UUIDs so reruns never duplicate and child links resolve deterministically; product batches/prices (no unique key) are matched by (product, batch_number) / first-retail-price and updated in place.
Reason: "Safe development seed data" was scoped by the user, not the docs; deferred items (permission catalog ASM-013/01.03, tax values ASM-015/01.05) plus demo master data needed materialized token/value decisions + a credential hash before the auth task exists.
Impact: Run `npm run seed` against the DEV database only; CI and tests use the seed programmatically against the ephemeral test DB. Anything financial still starts empty. The auth phase must own real password hashing/rotation and may rehash the demo users on first login.
Status: active
Resolution:

### ASM-026
Date: 2026-09-26
Task: 02.07 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Authentication Foundation
Assumption: (a) Password hashing uses Argon2id (SECURITY.md preferred algorithm) via @node-rs/argon2; default parameters 19456 KiB memory cost, time cost 2, parallelism 1 (OWASP-recommended baseline, library defaults) are data-driven via ARGON2_MEMORY_COST/ARGON2_TIME_COST/ARGON2_PARALLELISM env vars. (b) Token lifetimes are data-driven placeholders: ACCESS_TOKEN_TTL_SECONDS default 900 (15 min short-lived access per SECURITY.md) and REFRESH_TOKEN_TTL_SECONDS default 604800 (7 days rotating refresh) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â exact durations are NOT set by any authoritative document and Phase 04 (02/03 refresh/access tasks) is permitted to change defaults without a schema migration. (c) The AuthModule (02.07) deliberately implements NO endpoints, token issuance, revocation or sessions ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â those are Phase 04 tasks (04.01 Login, 04.02 Access Token, 04.03 Refresh Token, 04.04 Logout); the demo users' existing scrypt hashes (ASM-025c) are handled by rehash-on-first-login in Phase 04, not here.
Reason: SECURITY.md states Argon2id preference and short-lived-access/rotating-refresh shape but not exact parameters or durations; no authoritative source documents them. PasswordService must exist before any Phase 04 login flow can verify credentials.
Impact: Any Argon2id hash produced is PHC-encoded ($argon2id$v=19$...) and self-describing, so later parameter changes require no migration; token TTL values are read from config so Phase 04 can tune them without code changes.
Status: active
Resolution:

### ASM-027
Date: 2026-09-26
Task: 02.08 ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¿Ãƒâ€šÃ‚Â½ Repository Patterns
Assumption: (a) Repository interfaces are expressed as abstract classes (e.g. OrganizationRepository) so they work as NestJS DI provider tokens (TS interfaces are erased and unusable as tokens); abstract classes MUST define only method signatures, never concrete behavior. Prisma implementations extend BaseRepository (which exposes the PrismaClient) and are bound via { provide: <AbstractRepository>, useClass: Prisma<Entity>Repository }. (b) BaseRepository exposes the full PrismaClient (BaseRepository.client) to implementations; repositories are NOT wrapped with per-repository mockability layers because the unit-test boundary is the repository's own methods (tests mock the PrismaService client), and Prisma integration is proven by the test/db harness. (c) DatabaseModule is @Global (PrismaService available app-wide) matching the AppConfigModule/LoggingModule precedent; feature modules bind their own repository providers/exports. (d) PrismaService constructs PrismaClient + PrismaPg driver adapter once from AppConfigService.databaseUrl and disconnects on module destroy (OnModuleDestroy); connection is established lazily by the adapter on first query (no eager ) - matches the test/db spec harness and avoids holding a dev connection when the API runs before migrations.
Reason: Architecture mandates Repository Interface -> Infrastructure; NestJS DI needs runtime tokens; the repo's own DB specs already establish the PrismaPg + lazy-connect client pattern.
Impact: All future feature repositories must follow this shape; swapping Prisma for another infrastructure later only replaces the implementations, not the interfaces or consumers.
Status: active
Resolution:

### ASM-036
Date: 2026-09-27
Task: 03.04 - Dependency Injection
Assumption: (a) GetIt/Injectable DI foundation is complete with @InjectableInit in injection.dart generating injection.config.dart. (b) Three modules registered: AuthModule (AuthState singleton), RouterModule (GoRouter singleton with AuthState dependency), ThemeModule (ThemeProvider singletonAsync with SharedPreferences). (c) Environment-aware configuration supported via environment and environmentFilter parameters in $initGetIt. (d) SharedPreferences can be overridden for testing via configureDependencies parameter. (e) No additional DI infrastructure needed for current Flutter core phase; BLoC/Cubit, repositories, data sources will be added in later tasks.
Reason: Plan objective 03.04 is "GetIt/Injectable foundation." The DI foundation was established in Phase 00.04 and extended in 03.02 (ThemeModule) and 03.03 (AuthModule, RouterModule). This task verifies and documents the complete DI setup.
Impact: Provides complete DI foundation for all Flutter core modules. Ready for Network Client (03.05) and subsequent feature implementations.
Status: active
Resolution:

### ASM-037
Date: 2026-09-27
Task: 03.05 - Network Client
Assumption: (a) Dio ^5.4.0 used as HTTP client with base configuration: baseUrl http://localhost:3000/api/v1, 10s connect timeout, 30s receive/send timeouts, JSON content-type/accept headers. (b) Three interceptors: _AuthInterceptor adds Authorization: Bearer <token> from AuthState; _ErrorInterceptor maps backend canonical error format { error: { code, message, details, field_errors, request_id } } to AppException hierarchy (NetworkException, AuthException, ValidationException); _LoggingInterceptor for request/response logging (no-op in current implementation, ready for logger integration). (c) Error hierarchy: AppException (base with code, message, details, fieldErrors, requestId, statusCode), NetworkException.fromDioError() converts DioException, AuthException for 401, ValidationException for 400 VALIDATION_FAILED. (d) ApiClient provides refreshToken() method calling POST /auth/refresh with refresh_token, updating AuthState on success. (e) NetworkModule registers Dio and ApiClient as singletons in DI. (f) Base URL is hardcoded for dev; will be configurable via environment in later tasks.
Reason: Plan objective 03.05 is "Dio client, interceptors and error mapping." Dio is the chosen HTTP client per ARCHITECTURE.md; interceptors provide cross-cutting concerns; error mapping aligns with backend canonical error format from GlobalExceptionFilter.
Impact: Provides type-safe network layer for all API communication. Error hierarchy enables proper error handling in BLoC/Cubit and UI layers. Token refresh foundation for Phase 04 auth. Ready for offline-first sync integration in Phase 05/06.
Status: active
Resolution:

### ASM-028
Date: 2026-09-26
Task: 02.09 - Transaction Utilities
Assumption: (a) Transaction enforcement (AGENTS 21/23 and BR-028..031) is provided by a single interactive-transaction runner, PrismaService.runInTransaction(fn, options?), which delegates to PrismaClient.. Callbacks receive a Prisma.TransactionClient (PrismaTx); transactional isolation follows Postgres/Prisma defaults (ReadCommitted) unless the caller supplies TransactionOptions (maxWait/timeout/isolationLevel). (b) Repositories are transaction-aware by convention: abstract repository methods accept the last param tx?: PrismaTx and route through BaseRepository.clientOrTx(tx) (tx ?? base client). Omitting tx uses the shared client; running inside runInTransaction and passing tx makes reads/writes part of the same atomic unit. (c) runInTransaction is the ONLY supported way application services establish atomic multi-entity operations; repositories never open their own transactions - composition belongs to the application-service/use-case layer. (d) The same repository implementation must be usable both standalone and inside a transaction - it must not cache state across calls.
Reason: AGENTS mandates atomic multi-entity operations (21) and concurrency controls (23); plan 02.09 objective is reliable transactional application-service utilities; BR-028..031 are marked app-level in the Phase 01 audit.
Impact: Feature use-cases (sales, receipts, returns, payments) run inside runInTransaction and pass tx to repositories; repositories must accept import of PrismaTx type from prisma.service.ts. TransactionClient type comes from the generated Prisma namespace.
Status: active
Resolution:

### ASM-029
Date: 2026-09-26
Task: 02.10 - Idempotency Infrastructure
Assumption: (a) Idempotency is enforced per (organizationId, operationKey) via the new `idempotency_records` table. storeId and userId are nullable on the record but the unique scope is at the ORGANIZATION level (NOT the store/user) - Postgres treats NULLs as distinct so a composite unique including nullable storeId would not dedupe; organization-level scoping is the correct safety boundary because an operation key must never collide/replay across tenants (AGENTS 13, BR-038). (b) A completed record is replayed for the SAME organization + operationKey + requestHash regardless of whether expires_at has passed; a completed record with a DIFFERENT requestHash always conflicts (409 IDEMPOTENCY_CONFLICT) - replaying expired COMPLETED records never risks re-execution, so strongest guarantee wins over storage reclamation; only fresh IN_PROGRESS records block a retry (409 IDEMPOTENCY_IN_PROGRESS) and only EXPIRED IN_PROGRESS records are deleted (reclaimed) so a crashed/orphaned claim cannot permanently wedge a key. (c) The claim (IN_PROGRESS insert), the handler business writes, and the COMPLETED marker all execute INSIDE the same interactive transaction (runInTransaction, ASM-028); if the handler throws, the whole unit rolls back including the claim, so a failed operation leaves NO record and retries are clean - this is at-most-once for successes combined with retry-ability for failures. (d) Concurrency: two simultaneous same-key requests race the unique insert; the loser surfaces a Prisma P2002 at commit and IdempotencyService retries the transaction up to 3 times (20ms backoff); on a later attempt the winner's committed COMPLETED record is found and replayed/conflicted. (e) Idempotency-Key header flow: IdempotencyInterceptor (route-level, opt-in via @UseInterceptors) reads the `idempotency-key` header; when absent the request passes through untouched. requestHash = SHA-256 of method + originalUrl + canonicalized body (keys sorted recursively; arrays order-sensitive). The interceptor WAITS for the controller's real response (lastValueFrom(next.handle())) inside the service's run() so the stored responseBody is the RAW controller result; the global ResponseFormatInterceptor then wraps BOTH the live and replayed value identically - replay returns byte-identical `{data, meta}`. (f) Idempotency scope resolution is injected via DI token IDEMPOTENCY_SCOPE_RESOLVER; the default resolver reads request.context (set by Phase 04 auth middleware) and FAILS-CLOSED with 500 IDEMPOTENCY_SCOPE_UNAVAILABLE if absent - the interceptor NEVER trusts client-supplied org/store headers (AGENTS 13). (g) IDEMPOTENCY_TTL_SECONDS (default 86400 = 24h) bounds only IN_PROGRESS-claim lifetime; expired COMPLETED records are still replayed forever per (b), and no background reaper exists yet (storage reclamation is deferred - a reaper task would delete only records where status=IN_PROGRESS AND expires_at < now, but none is scheduled).
Reason: AGENTS 22 mandates idempotency with replay/conflict semantics and BR-038 at-most-once per operation id; the plan objective is durable idempotency-key storage + response replay; transaction-scoped claim+run+complete is the only design that both prevents duplicate business writes and permits clean retries (Stripe-style). Nullable storeId forces org-level unique scope at DB level.
Impact: Future sale/receipt/return/payment use-cases decorate their controllers with IdempotencyInterceptor and pass operation_id + a client-generated Idempotency-Key or use IdempotencyService.execute directly with their own operationKey/requestHash; Phase 04 auth must set request.context so resolveScopeFromRequest resolves; the 409 conflict/IN_PROGRESS error codes join the error contract.
Status: active
Resolution:

### ASM-030
Date: 2026-09-26
Task: 02.11 - Audit Infrastructure
Assumption: (a) AuditService and AuditRepository are WRITE-ONLY: the repository and service layers expose only `create`/`record` (no update, delete, or read-back surface) so audit trail integrity relies on the API not offering mutation paths - enforced in the Prisma implementation by simply never adding methods; there is NO role/permission check on audit writes at this layer, so callers (future use-cases) are responsible for calling AuditService.record within their own business transactions and after their own authorization checks. (b) `AuditLogParams.action`/`entity`/`entityId` are free-text strings: `entityId` accepts NON-UUID ids (e.g. sale_number `SALE-2026-0001`) per ASM-023b - the AuditLog schema has no enum constraints and entity_id is a plain TEXT column with NO FK, so callers pass whatever identifying string the audited operation has. (c) Omitted before/after are persisted as SQL NULL via Prisma.DbNull (never JsonNull) so `??` queries and jsonb operators behave like NULL; `AuditService.record` passes through `undefined` when the caller omits a side, and the repository maps undefined to Prisma.DbNull. (d) Security: AuditService deep-sanitizes before/after before persisting - recursive traversal redacting exact-key matches against a fixed sensitive-key set (password, passwordHash, token, accessToken, refreshToken, secret, apiKey, cardNumber, panNumber) replacing the value with the literal `[REDACTED]`, so audit records never store secrets (SECURITY.md Logging "never log passwords, access tokens, refresh tokens, secrets, or payment credentials"). The sanitizer is a best-effort redaction, not a replacement for passwords never existing in payloads. (e) AuditService.record(entry, tx?) is transaction-aware: when called inside a caller's runInTransaction the audit insert joins that transaction (atomically committed or rolled back with the business writes, AGENTS 21/25); when tx is omitted the record writes through the default client independently. The service opens NO transaction of its own (ASM-028 - callers own transactions).
Reason: Plan objective 02.11 is a reusable audit-logging service; BR-027 mandates important mutations create audit records and BR-039 forbids direct modification/deletion of audit trails; AGENTS 25 specifies the audit record shape (user, org, store, device where applicable, action, entity, entity ID, timestamp, before/after where appropriate). The AuditLog table already exists (migration add_audit_sync_schema) so no schema change is needed; free-text entityId and write-only surface follow the existing ASM-023b design decision.
Impact: Future sales, receipts, returns, payments, adjustments, transfers, and cash-close use-cases call AuditService.record inside their business transactions with before/after snapshots (sanitized automatically). Devices table exists for offline sync; the audit service does not require a device/network identity today. No migration needed.
Status: active
Resolution:

### ASM-031
Date: 2026-09-26
Task: 02.12 - Backend Integration Tests
Assumption: (a) The core infrastructure integration test boots the full real AppModule (all core modules wired: AppConfigModule, LoggingModule, HealthModule, AuthModule, DatabaseModule, OrganizationsModule, AuditModule, IdempotencyModule) against a provisioned minimart_test database, exercising the complete HTTP ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ filter/interceptor/pipe ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ service ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ repository ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ DB stack. (b) The test uses a mocked AppConfigService with getter-based overrides (not getOrThrow) because LoggingModule accesses config.logLevel via getter; this is a test-only accommodation. (c) OrganizationRepository is exercised through the real DI container (orgRepo.findById(id, tx?)) against the real test DB, verifying tx-aware repository routing works inside the full app context. (d) PrismaService.runInTransaction commit/rollback/visibility is tested end-to-end through the real PrismaService instance in the app container. (e) AuditService.record and IdempotencyService.execute are invoked through the real DI container and their writes are verified against the real test DB, confirming the modules integrate correctly with the transaction infrastructure. (f) The test creates necessary FK-dependent rows (store for audit_logs) inline since the test DB is fresh per run. (g) No business controllers exist yet (only AppController/HealthController); the integration test focuses on the core infrastructure wiring and the services accessible via DI, not HTTP business endpoints.
Reason: Plan objective 02.12 "Test core infrastructure" requires proving the entire backend core (config, logging, error handling, validation, response format, versioning, database, repositories, transactions, idempotency, audit) works together as a coherent stack against a real database. The test:db suite already covers schema/repo/service units; this test adds the full AppModule boot + HTTP stack + DI-wired services integration verification.
Impact: Provides confidence that the core backend infrastructure is correctly assembled and functional before building business use-cases. Catches wiring issues (DI overrides, module imports, transaction routing, FK constraints) that unit/db/individual e2e tests miss.
Status: active
Resolution:

### ASM-032
Date: 2026-09-26
Task: 02.13 - Backend Audit
Assumption: (a) The audit reviews the complete Phase 02 backend core (02.01-02.12) against AGENTS.md architecture rules (ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§9-27), business rules (BR-001 to BR-040), SECURITY.md requirements, and Phase 02 plan objectives. (b) Infrastructure components (config, logging, error handling, validation, response format, versioning, auth foundation, repositories, transactions, idempotency, audit) are all implemented and tested per plan; business use-cases (sales, purchases, inventory, customers, cash) are explicitly out of scope for Phase 02. (c) RBAC enforcement on HTTP endpoints is deferred to Phase 04 (auth) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â the permissions catalog exists (01.13) but guards/interceptors are not yet applied. (d) Weighted Average Cost calculation is deferred to Phase 03+ ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â schema supports batch-level unit_cost and movement-level cost tracking. (e) Offline POS and synchronization implementation is deferred to Phase 03+ ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â schema foundation (devices, sync_operations, conflicts) exists. (f) All 333 tests (82 unit + 13 e2e + 238 DB) pass; no critical, major, or blocking findings identified. (g) Deferred items are explicitly documented and do not violate AGENTS.md STOP conditions (no unknown compliance behavior, no invented business rules, no destructive migrations, no security ambiguity).
Reason: AGENTS.md ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§27 requires a comprehensive self-audit before task completion. Phase 02 objective is backend core infrastructure; this audit confirms all plan tasks (02.01-02.13) are satisfied with appropriate test coverage and no architectural violations.
Impact: Phase 02 (Backend Core) marked COMPLETE. Ready for Phase 03 (Business Use-Cases) and Phase 04 (Authentication/Authorization).
Status: active
Resolution:

### ASM-033
Date: 2026-09-26
Task: 03.01 - App Shell
Assumption: (a) The Flutter app shell uses window_manager ^0.4.2 for Windows window management (minimum size 1200x800, centered, standard title bar). This is a desktop-first approach; mobile/web targets are not yet configured. (b) Navigation uses GoRouter ShellRoute with a NavigationRail sidebar (9 destinations: POS, Products, Sales, Customers, Returns, Purchases, Inventory, Reports, Settings). The shell provides a persistent header with app title and user menu. Child routes render inside the shell content area. (c) Placeholder pages are created for all 9 POS modules; actual business UI is deferred to later tasks (03.02+). (e) window_manager is used for window initialization (min 1200x800, centered); bitsdojo_window was not used due to version incompatibility. (f) The HomePage AppBar was removed since the shell provides a persistent header; tests updated accordingly. (g) Flutter 3.44 (Dart 3.12) with GoRouter 18.0.1, GetIt 9.3.0, Injectable 3.0.0, window_manager 0.4.2.
Reason: Plan objective 03.01 is "Create desktop application shell." The shell provides the persistent navigation structure required for a POS desktop application. window_manager is a stable, maintained choice for Windows window management.
Impact: Provides the persistent navigation shell required for all subsequent POS feature implementations. Ready for Theme (03.02) and Routing enhancements (03.03).
Status: active
Resolution:

### ASM-034
Date: 2026-09-26
Task: 03.02 - Theme
Assumption: (a) The theme system implements Material 3 design tokens as Dart constants (AppColors, AppTypography, AppSpacing, AppBorderRadius, AppElevation, AppBreakpoints) for consistency and type safety. (b) Light and dark ThemeData are created with complete component theming for all Material 3 components used in the app (AppBar, Card, Buttons, Inputs, NavigationRail, NavigationBar, Chips, Dialogs, BottomSheets, SnackBars, Tooltips, Menus, Drawers, Lists, FAB, Progress, Sliders, Checkboxes, Radios, Switches, Icons, PageTransitions). (c) ColorScheme is fully configured for both light and dark modes with semantic colors (primary, secondary, tertiary, surface, error, outline, shadow, inverse) following Material 3 spec. (d) ThemeProvider uses ChangeNotifier with SharedPreferences persistence for theme mode (system/light/dark), initialized at app startup via GetIt. (e) Theme integration uses Provider/Consumer pattern at the root of the app (PosApp) to expose theme to the widget tree. (f) Provider ^6.1.2 and SharedPreferences ^2.2.3 are added as dependencies. (g) NavigationRailThemeData does not use 'extended' parameter (removed in Material 3); labelType is dynamically set based on extended state. (h) CupertinoPageTransitionsBuilder is imported from package:flutter/cupertino.dart for macOS transitions.
Reason: Plan objective 03.02 is "Theme tokens, typography and light/dark support." Material 3 is the current Flutter standard; tokens ensure consistency; Provider is the standard DI pattern for theme state in Flutter.
Impact: Provides consistent visual design system for all POS modules. Ready for Routing (03.03) and feature implementation.
Status: active
Resolution:

### ASM-035
Date: 2026-09-27
Task: 03.03 - Routing
Assumption: (a) AuthState uses ChangeNotifier for authentication state management with three states: unknown, authenticated, unauthenticated. (b) LoginPage provides email/password form validation with demo credentials hint. (c) GoRouter uses refreshListenable on AuthState for automatic route re-evaluation on auth state changes. (d) Redirect function implements protected routes pattern: unknown state allows current route (no redirect), unauthenticated redirects to /login, authenticated on /login redirects to /pos. (e) Tests use SharedPreferences.setMockInitialValues({}) to mock SharedPreferences for ThemeProvider initialization. (f) Tests use ChangeNotifierProvider.value for ThemeProvider instead of Provider.value.
Reason: Plan objective 03.03 is "GoRouter structure and protected routes." AuthState provides the authentication status needed for route guards; LoginPage is the public route for unauthenticated users; GoRouter redirect logic enforces protected routes.
Impact: Provides routing infrastructure for authentication integration in Phase 04. AuthState and LoginPage are foundations for Phase 04 auth features.
Status: active
Resolution:

### ASM-038
Date: 2026-09-27
Task: 03.06 - Error Handling
Assumption: (a) ErrorPresentation extension on BuildContext provides showErrorSnackBar, showErrorDialog, and buildErrorBanner methods for Material 3 themed error presentations. (b) User-friendly message mapping covers all backend canonical error codes: NETWORK_ERROR, CONNECTION_ERROR, TIMEOUT, HTTP_401, HTTP_403, HTTP_404, HTTP_409, VALIDATION_FAILED, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, TOO_MANY_REQUESTS, INTERNAL_SERVER_ERROR, UNKNOWN_ERROR. (c) NetworkException snackbar includes Retry action; AuthException maps to session expired message; ValidationException displays field_errors inline. (d) ErrorHandler static class handles uncaught errors (AppException, DioException, other) with appropriate presentation. (e) ErrorModule registers no services (extensions and static classes don't need DI). (f) Material 3 theming uses errorContainer/error colors for consistency.
Reason: Plan objective 03.06 is "Application error model and presentation mapping." The error presentation layer decouples backend canonical error codes from user-facing messages, provides consistent Material 3 themed error UI, and enables retry actions for recoverable errors.
Impact: Provides consistent error handling across all POS modules. Foundation for Phase 04 auth error flows (session expired ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ login redirect). Ready for Phase 05/06 offline sync error handling.
Status: active
Resolution:

### ASM-039
Date: 2026-09-27
Task: 03.07 - Drift Database
Assumption: (a) Drift ^2.18.0 with NativeDatabase.createInBackground for non-blocking SQLite access on Windows. (b) 17 tables matching backend Prisma schema: Organizations, Stores, Registers, Users, Categories, Brands, Units, TaxCategories, Products, ProductBarcodes, ProductPrices, InventoryLocations, ProductBatches, InventoryBalances, InventoryMovements, Customers, SyncOperations. (c) DatabaseService provides initialize(), close(), clearAllData(), getStats() for database lifecycle management. (d) SyncOperations table implements offline sync queue with state machine (PENDING/SYNCING/APPLIED/FAILED/RETRY/CONFLICT/MANUAL_RESOLUTION/REJECTED) per OFFLINE_SYNC.md. (e) InventoryMovements with signed quantity and operationId enable idempotent sync and FEFO/WAC compliance. (f) path_provider ^2.1.0 for database file location in app documents directory; sqlite3_flutter_libs ^0.5.0 for native SQLite on Windows. (g) Schema version 1 with MigrationStrategy for future migrations.
Reason: Plan objective 03.07 is "Local database foundation." Drift is the chosen ORM per ARCHITECTURE.md; local SQLite enables offline-first POS per AGENTS.md ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§17; schema mirrors backend for seamless sync per AGENTS.md ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§18.
Impact: Provides local database foundation for offline POS operations. Enables Phase 08 Local Repositories and Phase 09 Sync Infrastructure. Schema matches backend for seamless synchronization.
Status: active
Resolution:

### ASM-040
Date: 2026-09-27
Task: 03.07 - Drift Database (design questions for Task 03.08)
Assumption: Item 1 was resolved from existing documentation. Items 2-5 remain genuinely open and no decision has been taken; none should be inferred from the current code.
Resolved item 1 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Local numeric representation. RESOLVED, not an open question. An earlier draft of this entry wrongly framed it as an unresolved business decision. It is not: `AGENTS.md` ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§12 requires NUMERIC for money and forbids floating point, and `brain/ARCHITECTURE.md` ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§Database repeats this. Drift/SQLite has no native decimal type, so the only open part was the mechanism, which is an engineering decision rather than a business rule. Implemented `Decimal` in `apps/pos/lib/src/database/decimal.dart`: a fixed-point value backed by an integer count of minor units, converted through Drift `TypeConverter`s (`decimal2` money, `decimal3` quantity, `decimal4` tax rate, `decimal6` unit conversion), matching the backend `Decimal(14,2)` / `(14,3)` / `(14,4)` / `(14,6)`. Downscaling rounds half away from zero rather than truncating, so repeated weighted-average rounding does not systematically lose value. `toDouble()` is documented as display/JSON only. `test/decimal_test.dart` covers exactness (1000 one-paisa additions summing to exactly 10.00) and asserts that the float64 equivalent does not.

Open item 2 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Schema coverage. 17 of roughly 35 backend Prisma models are mirrored locally. Not mirrored: Sale, SaleItem, SaleItemAllocation, SaleReturn, Payment, Invoice, PurchaseOrder, GoodsReceipt, Supplier, CustomerLedgerEntry, CustomerPayment, StockAdjustment, StockTransfer, CashSession, CashMovement, Expense, ExpenseCategory, Device, Role, Permission, UserRole, RolePermission, UserStoreAccess, UnitConversion, Conflict, IdempotencyRecord. `brain/OFFLINE_SYNC.md` ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§Offline Sale Transaction requires an offline sale to atomically write Sale, Sale Items, Payments, Inventory Movements, Inventory Balance, Cash Movement, Customer Ledger, Invoice, and Sync Operation, so the current schema cannot yet satisfy the documented offline sale. Needs a decision on which models the POS must hold locally.
Open item 3 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Foreign keys. The local schema declares no foreign key constraints. Enforcing them locally would reject server-authoritative rows that arrive out of sync order during multi-device reconciliation; not enforcing them allows orphaned local rows. Needs a decision, informed by `brain/OFFLINE_SYNC.md` ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§Conflict, which requires the server to detect and resolve conflicts explicitly rather than silently overwrite.
Open item 4 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Startup migration. `DatabaseService.initialize()` exists but is not called from `main.dart`; the `LazyDatabase` runs migrations lazily on first query. Needs a decision on whether the POS should run migrations at startup and surface failure to the user, or stay lazy.
Open item 5 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Outbox payload contents. `SyncOperations.payload` stores the business payload JSON locally. RESOLVED by 03.09 in the sense that a concrete rule now exists and is enforced: `PayloadGuard` in `apps/pos/lib/src/sync/payload_guard.dart` rejects any payload containing a credential-bearing key (password, passwordHash, token, accessToken, refreshToken, idToken, secret, apiKey, cardNumber, panNumber, pin, otp, authorization, cookie) at any nesting depth, using the same deny-list the backend audit service redacts with. Rejection happens before the insert, so a rejected payload leaves no row. This is defence in depth: the sync engine must still never place a credential in a payload.
Reason: AGENTS.md ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§5 forbids inventing business rules, database relationships, and sync behavior, and ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§28 requires stopping when required behavior is undefined. Items 2-5 each affect tenant data integrity or offline correctness and are not settled by existing documentation. Item 1 was resolvable from existing documentation and has been.
Impact: Task 03.07 is a sound foundation. Task 03.08 repository conventions can be built on it, but the repositories that write to tables not yet mirrored (item 2) cannot be completed until the local table set is decided.
Status: open ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â item 1 resolved; item 5 resolved by 03.09 (PayloadGuard); items 2-4 pending
Resolution:


## ASM-041

Task: 03.09 - Sync Infrastructure Skeleton

Finding (defect, not a decision): The local SyncOperations outbox table has deviceId but no organizationId and no storeId. Every other organization-scoped local table in pps/pos/lib/src/database/app_database.dart carries organizationId. Consequence: the outbox cannot be filtered by organization, and nothing in the row proves which organization a queued business operation belongs to. BR-040 requires that one organization must never access another organization's data. A device is expected to belong to exactly one organization, so a device-scoped queue is defensible in practice, but that relationship is enforced nowhere in the local schema and is not asserted at enqueue time.

Action taken in 03.09: implemented the queue scoped by deviceId, which matches the current schema and the local-authority model in rain/OFFLINE_SYNC.md. No schema change was made.

Why no schema change: adding a NOT NULL organizationId to an existing table is a breaking change for existing rows and requires a schemaVersion bump with a real onUpgrade migration. AGENTS.md section 28 requires stopping when a migration may cause destructive data loss, and the startup-migration policy is itself undecided (ASM-040 item 4).

Reason: AGENTS.md section 5 forbids inventing database relationships, and the correct fix depends on two undecided questions - whether the local table set changes (ASM-040 item 2) and whether migrations run at startup (ASM-040 item 4).

Impact: the sync queue is functionally correct for a single-organization device but cannot enforce BR-040 structurally. A future multi-organization device, a device reassignment, or a merged database file would make this a real isolation defect. Must be decided before Task 11 (Offline Sync) writes real business operations through the queue.

Status: open - blocking for Phase 11, not for the 03.09 queue foundation

Resolution:

## ASM-042

Task: 03.10 - UI Component System
Assumption: The UI component library can be built as a pure widget layer without business logic, following the Presentation Ã¢â€ â€™ Use Case Ã¢â€ â€™ Repository Ã¢â€ â€™ Data Source dependency direction from ARCHITECTURE.md.
Resolution: COMPLETED. Components are pure widgets with no business logic, no database/network access, and no direct Drift/Dio dependencies. All business logic and data access are delegated to use cases and repositories.

Impact: Task 03.10 complete. 149 core tests pass. Components ready for use by feature modules (POS, Products, Inventory, etc.) in Phase 05+.

## ASM-043

Task: 03.12 - Flutter Audit
Assumption: The Flutter architecture and foundation (Tasks 03.01-03.11) is complete and auditable as a unit. No business rules were invented during the audit; all findings are traceable to existing documentation (AGENTS.md, ARCHITECTURE.md, SECURITY.md, OFFLINE_SYNC.md, BUSINESS_RULES.md, business rules).
Resolution: COMPLETED. Audit performed and passed. Tasks 03.01-03.11 (Phase 03 Flutter Core) are approved as a solid foundation.
Impact: Phase 03 (Flutter Core) is COMPLETE. Next available: Phase 04 (Auth/RBAC) or Phase 04 (Auth/RBAC), subject to ASM-040/041.
Status: resolved

## ASM-044

Task: 04.11 - Auth Audit
Assumption: NONE TAKEN. The audit deliberately did not choose an offline session maximum duration. Task 04.10 built the offline session foundation, and brain/OFFLINE_SYNC.md defines the SyncOperation/Conflict behavior, but no document states how long a POS terminal may operate without a successful server round trip before it must refuse to trade.

Reason: AGENTS.md section 5 forbids inventing business rules, and section 28 requires stopping when required behavior is undefined. A maximum offline duration is a business and tax-compliance decision for a Nepal retail operator, not an engineering default. Guessing one would silently authorize either unbounded offline trading (a compliance risk) or unnecessary terminal lockout (a revenue risk). The user confirmed this explicitly during the 04.11 audit: do not invent a duration, record it as open.

Impact: The offline session remains unbounded by duration. A terminal that has not synced can continue issuing local business operations indefinitely, and each one is queued for later server validation. Nothing in the current code or schema caps this. This must be decided before the offline sync workstream (Phase 11) makes queued operations financially real, and it interacts with any future session expiry on the access token itself.

Status: open - does not block Task 04.11, must be resolved before Phase 11

Resolution:

## ASM-045

Task: 04.11 - Auth Audit
Assumption: NONE TAKEN. An initial password policy for newly created user accounts was NOT defined by this task.

Reason: The 04.11 audit found uncommitted work that would have created accounts with a hard-coded constant password (`TempPassword123!`) whenever an administrator omitted the password field. No brain document defines a temporary or initial password policy, and no document defines password complexity rules beyond "Argon2id" in brain/SECURITY.md. Rather than invent a policy (AGENTS.md section 5), the invented behavior was removed: `password` is now a required field on `CreateUserDto`, so an account can never be created with a password the system chose on the caller's behalf.

Impact: The API contract for user creation is stricter than the uncommitted work intended. An administrator must supply an initial password when creating a user. There is no password reset, invitation email, or forced-rotation-on-first-login flow; those remain undefined and unimplemented.

Status: open - a documented initial-password and first-login rotation policy is still required before the auth feature is production ready

Resolution:

## ASM-046

Task: 04.11 - Auth Audit
Finding (pre-existing defect, not introduced by this task): Three brain documents are stored with corrupted character encoding. `brain/CURRENT_STATE.md`, `brain/AUDIT_LOG.md`, and `brain/ASSUMPTIONS.md` contain mojibake sequences where characters such as em dash, arrow, and check mark should be. `CURRENT_STATE.md` was damaged by a UTF-8-as-cp1252 round trip; `AUDIT_LOG.md` and `ASSUMPTIONS.md` show a different signature consistent with a UTF-8-as-CP437 round trip, so the three files are not all damaged the same way and a single repair pass is not safe for all of them. All other brain documents are clean.

Action taken in 04.11: none. The corruption predates this task, is unrelated to authentication, and a lossy repair would damage the audit history itself.

Reason: AGENTS.md section 6 forbids unrelated refactors, and section 28 requires stopping when a change may destroy historical data. The audit log is the project's primary evidence trail; silently rewriting it is a worse outcome than leaving it legibly damaged.

Impact: Readability of the audit history and state document is degraded. Content is not lost, and every ASCII portion is intact and greppable. The 04.11 entries were appended as clean ASCII so that no new corruption is introduced.

Status: open - needs a dedicated repair task with a per-file codepage analysis and a diff review

Resolution:

## ASM-047

Task: 05.01 - Category Hierarchy
Assumption: The category tree has no enforced maximum depth. Cycle prevention is the only structural constraint applied to `categories.parentId`.

Reason: The task was put to the user as an explicit decision rather than being invented. The alternatives considered were a depth limit versus none. The user chose no maximum depth, so hierarchy validation consists of same-organization parent checks, self-parent prevention, and ancestor-walk cycle detection. No business document defines a maximum depth, so imposing one would have invented a rule (AGENTS.md section 5).

Impact: A category chain of unbounded length is representable. The ancestor walk in `CategoryService` is iterative rather than recursive, so a deep chain costs database round trips proportional to depth and cannot blow the Node call stack. Deep trees will be slow to validate rather than incorrect. If product nesting later needs a practical ceiling, this assumption must be revisited and a limit added to the service together with a documented rule.

Status: open - revisit if a maximum category depth is ever required

Resolution:

## ASM-048

Task: 05.02 - Brands
Assumption: Brand routes reuse the existing `products:manage` permission code. No new `brands:manage` code was added to the catalog.

Reason: A permission code is a business-rule change, so adding one is a decision rather than an implementation detail (AGENTS.md section 5). Two documented facts pointed to reuse without asking: `brain/BRAIN.md` groups the catalog as "Organization -> Products -> Categories -> Brands -> Units", and Task 05.01 already introduced `products:manage` and the user explicitly decided that category reads and writes are gated by it. Brands are the adjacent flat master-data entity in the same catalog, so splitting brands onto their own code would have added a catalog entry that no document asks for. The catalog therefore stays at 21 codes and `brain/SECURITY.md`, the seed, and the guards are all unchanged by this task.

Impact: Any user who may manage categories may also manage brands, units, and later product master data under the same code. If catalog administration is ever to be separated from product administration, that is a documented catalog change affecting SECURITY.md, the seed, and every catalog route, and this assumption should be closed then.

Status: open - revisit if catalog administration needs its own permission code

Resolution:

## ASM-049

Task: 05.03 - Units
Assumption: `Unit.precision` is the number of decimal places a quantity in that unit may carry, and is constrained to the integer range 0-3 by the request DTO. The database column itself is an unconstrained `Int`, and no check constraint was added.

Reason: No brain document defines what `precision` means or what values are legal. The range was derived from two documented facts rather than invented. `docs/DATABASE_CONVENTIONS.md` stores every quantity as `NUMERIC(14,3)`, so no quantity anywhere in the system can express more than three decimal places and a unit advertising four would promise precision the ledger cannot hold. The seed already uses 0, 2, and 3, which is consistent with a decimal-place reading. Enforcing the rule only in the DTO keeps it out of the database, because a migration touching an existing column on a catalog table was not justified by this task; `products:manage` governs writes to units, and every write path goes through that DTO.

Impact: A direct SQL insert or a future write path that bypasses the DTO could store a precision above 3, and the mismatch would surface later as a quantity that cannot be recorded exactly. Precision may also be edited downward on a unit that already has stock or history, because no rule restricts changing it once references exist. Both need a documented rule and a database check constraint before the value is relied upon financially. Revisit in 05.04 or with the inventory work, whichever comes first.

Status: open - needs a database check constraint and a precision-change rule

Resolution:

## ASM-050

Date: 2026-09-30
Task: 05.04 - Unit Conversions
Assumption: The following conversion rules were decided by the user because no brain document defines them, and are recorded here rather than treated as engineering defaults.

1. Multiplier means "how many toUnit make up one fromUnit". This was derived, not invented: the seed already stores `DOZ -> PCS 12` and `BOX -> PCS 10`, and `brain/DOMAIN_MODEL.md` describes conversions as packaging relationships. The reverse reading would make both seeded rows smaller than one, which is not what a packaging factor is.
2. Reciprocals are explicit rows and are never derived. `PCS -> DOZ 0.083333` is stored as its own row with its own factor; it is not computed as `1/12`, so a value such as `0.083333` survives exactly as the user typed it rather than being silently replaced by the repeating decimal.
3. Self-conversion is rejected.
4. A direct reciprocal pair is permitted, and cycles of length three or more are rejected. These two rules were reconciled during implementation: a blanket ban on reverse edges would also block the two-node case the user explicitly wants. The implemented cycle walk therefore ignores a reverse edge only when it is the immediate successor of the proposed edge, and rejects any longer path back to the source.
5. The multiplier must be greater than zero. It is checked in the DTO for shape and in the service for the sign, so the error names the reason. No database CHECK constraint was added, because adding one is a migration and migrations were not in this task's scope.
6. The multiplier may be edited and rows may be hard-deleted. The model has no `status` column and the user chose not to add soft deactivation.
7. Direction is immutable after creation. Only the multiplier is updatable; inverting a factor is a delete plus a create, so a direction can never be rewritten underneath existing transactions. This is an implementation decision made to keep the audit trail legible rather than a user decision.
8. `multiplier` is accepted as a JSON number or a string and is always serialized as an exact decimal string matching `DECIMAL(14,6)`. A client that needs the sixth decimal place preserved must send a string, because JSON has already parsed a number to a double before the request reaches the DTO.
9. Cycle detection uses an iterative, batched breadth-first walk over organization-scoped outgoing edges rather than a recursive query, so a deep graph costs round trips proportional to breadth and cannot overflow the call stack. This is an implementation detail with no behavioral consequence beyond the rule in item 4.
10. Cross-tenant conversion edges are prevented by the service, which verifies that both units belong to the caller's organization. The two foreign keys on `unit_conversions` only check that the unit rows exist, so the service check is the only barrier. A DB test writes a cross-tenant edge directly through Prisma to record this, because it is not obvious from reading the schema.

Reason: AGENTS.md section 5 forbids inventing business rules. Each item above was either derived from a documented fact (items 1 and 10) or put to the user as an explicit choice (items 2 through 6, 8).

Impact: A user who wants the same relationship in both directions must create two rows, and a client that sends `0.083333` as a JSON number rather than a string may receive a slightly different value back. The absence of a database-level check on the multiplier and on unit organization means any future write path that bypasses this service could persist a non-positive or cross-tenant factor, so the service-level checks must not be dropped and a later migration should add both constraints once the conversion tables are otherwise stable.

Status: active - revisit if a deactivation rule, a maximum graph depth, or a database-level constraint is ever documented.

Resolution:

## ASM-051

Date: 2026-10-01
Task: 05.05 - Product Master
Assumption: The following product rules were decided by the user because no brain document defines them, and are recorded here rather than treated as engineering defaults.

1. Every product route requires `products:manage`. The catalog also defines `products:create`, `products:update` and `products:deactivate`, and all three are left unused: making the product master the only catalog entity with split read and write permissions is a business-rule change, and a permission code is exactly that.
2. `DELETE /api/v1/products/:id` is exposed and guarded. Any recorded history turns the delete into a 400 that instructs the caller to deactivate instead. A product with no history is hard-deleted, which is safe because the guarded child tables are empty and `product_barcodes` cascades.
3. `categoryId`, `brandId`, `unitId` and `taxCategoryId` are all optional. A supplied reference must belong to the caller's own organization; the four foreign keys only check that the parent row exists, so the service check is the only barrier (BR-040). A cross-tenant or unknown reference is reported as an unusable input, not as a forbidden one, so existence is not disclosed across tenants.
4. Prices and reorder values are zero or greater. Zero is allowed, because a zero default price or a zero reorder threshold is a legitimate instruction, and a sign is refused at the edge rather than left to the column.
5. The SKU is stored exactly as supplied with no case normalization, and the name is not unique. The organization-plus-SKU unique index is the only natural key a product has; a mini-mart legitimately stocks the same drink in several sizes.
6. The product list carries no reference counts and no stock quantity. Inventory is a ledger projection and must never be read off a product row (AGENTS.md 14), and the ten child tables that block a delete are all owned by later phases.
7. On the wire, money and quantity are exact decimal strings, but the stored scale is not echoed. Prisma's `Decimal` serializes through `toString()`, which normalizes trailing zeros, so `60.00` arrives as `"60"` and `10.000` as `"10"`. The value is exact; a client that needs a fixed number of decimals formats for display. An earlier draft of the DTO documentation promised the stored scale and was corrected once the e2e fake was replaced with the real Prisma `Decimal`.
8. The list supports `search` over name and SKU, a `status` filter, pagination, and `sortBy` restricted to `createdAt`, `updatedAt`, `name`, `sku` and `status`. Anything else falls back to the default rather than reaching Prisma, because `sortBy` is otherwise an attacker-controlled key and `organizationId` would let a caller order rows by tenant. No category, brand or unit filter is exposed in this task.
9. Create always writes `status: active`; `PUT /:id/deactivate` writes `inactive`; a plain update may also set either value, which is how a deactivated product is brought back.

Reason: AGENTS.md section 5 forbids inventing business rules. Items 1 through 4 were put to the user as explicit choices. Items 5 through 9 are implementation decisions with no business-rule content, recorded so the next reader does not have to re-derive them from the code.

Impact: A caller with `products:manage` can change every product field, so the separation of duties a shop owner may want is not available for products alone. The organization checks in item 3 exist only in the service, so any future write path that bypasses it could attach a product to a parent in another tenant. A product whose only child rows are batch rows is blocked from deletion by an explicit `productBatch` count; that count was missing from the first implementation of the guard and was found by a database test, because no unit or e2e fake would have surfaced it.

Status: active - revisit if a per-store product scope, split create and update permissions, a reference count column, or a database-level cross-tenant parent constraint is ever documented.

## ASM-052

Date: 2026-10-01
Task: 05.06 - Product Barcodes
Assumption: The following barcode rules were decided by the user because no brain document defines them, and are recorded here rather than treated as engineering defaults. ASM-014 already committed the application to enforcing a primary-barcode rule but never said what that rule is.

1. Barcode routes are nested under the product that owns them: `POST` and `GET /api/v1/products/:productId/barcodes`, and `GET`, `PUT`, and `DELETE /api/v1/products/:productId/barcodes/:id`. A top-level `/api/v1/barcodes` collection would have made `productId` a client-supplied body field on every call, and the parent product is the thing that authorizes the call.
2. A product has at most one primary barcode, and a primary is optional. Promoting a barcode demotes the previous one inside the same transaction, no barcode is required to be primary, and deleting or unsetting the primary leaves the product with none rather than promoting a successor, because no document says which remaining code should inherit the role.
3. The barcode value is immutable after creation. Only `barcodeType` and `isPrimary` are updatable, and a mistyped code is corrected by deleting the barcode and creating the right one, both of which are audited. The rule is enforced by the absence of the field from the update DTO, so the global validation pipe refuses the request with 400 rather than dropping the field silently.
4. A value is free text of 1 to 64 characters rather than a digit pattern, and `barcodeType` is free text of 1 to 32 characters with no allowed-value set. No brain document defines a barcode format, and a Nepalese mini-mart legitimately prints alphanumeric in-store, bundled, and weighted codes, so an EAN or UPC digit rule would refuse real shelf labels. Values are stored exactly as supplied, with no trimming and no case folding, because a scanner reads the printed string back.
5. Scan lookup is not part of 05.06. Resolving a scanned code to a product belongs to the offline catalog search (05.10) and the POS scan path (08.03), which already own that contract, so no server-side lookup route was exposed here.
6. Every barcode route requires `products:manage` and `@RequireTenantScope()`, reusing the code the whole catalog chain already uses. Tenant scope is organization-only: a barcode is a label on a product and is shared by every store in the organization.

Reason: AGENTS.md section 5 forbids inventing business rules, and items 1 through 5 were put to the user as explicit choices. Item 6 follows the decision already recorded in ASM-048 and ASM-051 rather than adding a permission code. One implementation detail is worth naming: the collection is returned whole and unpaged, because a product carries a handful of codes and there is no filter that would narrow it.

Impact: The at-most-one-primary rule lives in the service only. A partial unique index (`WHERE is_primary`) is the database answer and was not added, so two concurrent promotions on the same product could each commit a primary; sharing one transaction prevents a half-applied demotion or a product observed with no primary inside a transaction, but it does not serialize two interleaved promotions. The value uniqueness check is likewise a service pre-check in front of the existing `@@unique([organizationId, barcode])`, so a lost race surfaces as a `P2002` rather than a 409, which is the same shape as the SKU, brand, unit, and conversion checks and is left consistent with them. The `@@index([barcode])` on `product_barcodes` has no query behind it yet, because scan lookup is deferred.

Status: active - revisit if scan lookup is pulled into the management API, if a per-store barcode scope is documented, or if a catalog migration adds a partial unique index on `is_primary` and a length limit on `barcode`.

## ASM-053

Date: 2026-10-01
Task: 05.07 - Tax Categories
Assumption: The following tax category rules were decided by the user because no brain document defines them, and are recorded here rather than treated as engineering defaults. ASM-015 already committed the application to organization-scoped, code-unique, effective-dated, auditable tax categories but never said what the rate bounds are, whether a rate change inserts a new row, or what a null end of the window means.

1. `rate` is any non-negative value that fits the column, which is `NUMERIC(14,4)`: at most 10 integer digits and 4 decimal places. Zero is allowed, a rate above 100 is allowed, and there is no business cap, because the column scale is the only documented limit and a rate above 100 is something an operator in another jurisdiction could legitimately configure. A negative value and exponent notation such as `1e-7` are both refused, the first because tax is never negative here and the second because it would slip past the scale check. The value is sent as a number or a string and returned as an exact decimal string with trailing zeros normalized away by Prisma, so a stored `13.0000` arrives as `"13"`.
2. A rate change edits the row in place. `rate` and the effective window are both updatable, the previous values are kept in the audit history, and no new row is inserted and no previous row is closed off. ASM-015(b) said a rate change is an auditable edit, and superseding rows were offered to the user as an alternative and declined, so a historical sale keeps pointing at the row whose rate it used.
3. `effectiveFrom` is required and may be any date, in the past or in the future, because a rate is routinely configured before it applies. `effectiveTo` is optional and null means the rate is open-ended, which is the common case for a rate in force until superseded. When supplied it must be strictly later than `effectiveFrom`; equal dates would describe a zero-length window no sale could fall inside and an earlier end would describe a window that never opens. The window is validated on every update against the merged result, so a patch that moves only `effectiveFrom` cannot leave the stored `effectiveTo` behind it.
4. `code` is mutable and is unique per organization, with the same organization-wide duplicate check the unit code uses, and the name is not unique. The code is stored exactly as supplied, with no trimming and no case folding, because no brain document defines a casing rule.
5. Nothing is validated when a product is pointed at a tax category. An inactive category, or one whose effective window does not cover today, still accepts the reference. Deciding which rate applies to a transaction belongs to Task 14.03, and enforcing a window here would be a business rule invented ahead of it.

Reason: AGENTS.md section 5 forbids inventing business rules, and items 1 through 5 were put to the user as explicit choices. Item 5 also follows AGENTS.md section 24, which requires tax behavior to be data-driven and forbids hardcoding rates into business logic: this task stores configuration and computes nothing.

Impact: The rate bounds are a DTO pattern rather than a database check, so a value outside the column scale is refused with 400 before it reaches PostgreSQL, and the database is the second line of defence rather than the first. The code uniqueness check is a service pre-check in front of the existing `@@unique([organizationId, code])`, so a lost race surfaces as a `P2002` rather than a 409, which is the same shape as the SKU, brand, unit, and barcode checks and is left consistent with them. Editing a rate in place means the row no longer records the rate as it stood at any earlier moment, so the audit log is the only place the previous value survives, and a rate change is therefore not safe to perform without it. The rate is not sortable in the listing, because NUMERIC ordering was not part of the documented listing contract.

Status: active - revisit if rate changes are ever made append-only, if a rate cap is documented for the jurisdictions in scope, if a tax-type value list is ever sourced from an authoritative register, or if a catalog migration adds a `CHECK` on the rate and an exclusion constraint on overlapping effective windows for one code.

## ASM-054

Date: 2026-10-01
Task: 05.08 - Prices (price history and effective periods)
Assumption: The following price rules were decided by the user because no brain document defines them, and are recorded here rather than treated as engineering defaults. ASM-015 already committed the application to a product, a price type, an amount, and an effective window, and it committed the service to rejecting overlapping active periods for one price type, but it never said what the amount bounds are, whether a price change edits a row or appends a period, whether the rejection of overlap extends to windows in the past, or what may be deleted.

1. Routes are nested under the parent product rather than exposed as a top-level collection, because `product_prices` has no `organization_id` and the parent product is therefore the only thing that can authorize the call. This extends the reasoning already recorded in ASM-052 for barcodes.
2. `amount` is any non-negative value that fits the column, which is `NUMERIC(14,2)`: at most 12 integer digits and 2 decimal places. Zero is allowed and there is no business cap, because the column scale is the only documented limit. A negative value, exponent notation, and more than two decimal places are refused. A price is sent as a number or a string and returned as an exact decimal string, so `150.00` arrives as `"150"`.
3. A price period is append-only history. `amount`, `priceType`, and `effectiveFrom` are immutable and the only edit is retiring a period by setting `effectiveTo`, so a price change is a retirement plus an insert rather than an in-place edit. This is the opposite of the in-place tax rate edit in ASM-053, and deliberately so: a price row is a period rather than a single definition, and BR-035 keeps historical sale prices correct either way, so the only thing lost by appending is convenience. A mistyped amount is corrected by closing the period and inserting a new one. An omitted `effectiveTo` on an update leaves the stored value alone, while an explicit `null` reopens the period, which is permitted only when no other period of the same price type intersects it.
4. Two periods of the same `(productId, priceType)` may never intersect, including in the past, so the price in force at any instant is unique. This resolves the commitment in ASM-015 to disallow overlapping active periods in favour of the strict reading, since a price that is ambiguous only in the past is still ambiguous to a historical report. Windows are half-open, so a successor may start at exactly the instant its predecessor ends. The check runs inside the write transaction, but it is a service pre-check rather than a database exclusion constraint, because Prisma cannot express one, so two concurrent overlapping inserts on the same product and price type can both commit. `priceType` is free text with no case normalization, following ASM-014(d), so `Retail` and `retail` are two independent series.
5. A period may be deleted only while it has not started, that is while `effectiveFrom` is strictly later than now. A future price typed by mistake can be removed; a price that has already taken effect must be retired instead, so price history is never erased. A period that has started and not ended is refused as firmly as one that has already ended.

Impact: A price change costs two requests rather than one, and those two requests are not atomic, so a failure between them leaves the product with no price in force until the insert is retried. The overlap rule is advisory at the database level, so the guarantee that a price is unambiguous holds within a transaction but not across two concurrent writers. Nothing requires a product to have any price at all, and the at-least-one-price check before selling has not been implemented, so a product can currently be offered with no price defined. Resolving a price to sell is deliberately not exposed here as a current-price endpoint; the listing accepts `effectiveOn` to answer the same question from the same half-open interval, and choosing a price belongs to the offline catalog and POS tasks (05.10, 08.03).

Status: active - revisit if a price change is ever made atomic through a dedicated endpoint, if a catalog migration adds a PostgreSQL exclusion constraint on overlapping windows for one product and price type, if an authoritative list of Nepal price types is ever sourced, if a minimum price or a per-product minimum count is documented, or if the POS requires resolving a current price server-side.
