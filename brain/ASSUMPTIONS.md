# MiniMart OS — Assumptions

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
Task: 00.01 — Repository Initialization
Assumption: Git repository is initialized with default branch `main`.
Reason: Git was not yet initialized; `main` is the modern default and Task 00.05 CI will target the default branch.
Impact: Repository history starts on `main`. Renaming the branch later is trivial.
Status: active
Resolution:

### ASM-002
Date: 2026-09-25
Task: 00.01 — Repository Initialization
Assumption: Environment templates are provided at repo root (development infrastructure, consumed by root docker-compose) and services/api/.env.example (application-level configuration).
Reason: docker-compose.yml lives at the repository root; the backend service will read application configuration from its own environment.
Impact: Task 00.02 (Docker) and Task 00.03 (Backend Bootstrap) may extend these templates.
Status: active
Resolution:

### ASM-003
Date: 2026-09-25
Task: 00.02 — Docker Development Environment
Assumption: Development container images are pinned to postgres:17-alpine and redis:7-alpine.
Reason: Reproducible dev environment; alpine variants keep image size small. Version selection is a tooling choice, not a business rule.
Impact: If a later phase requires a different PostgreSQL major for a feature, the pin can be bumped via an explicit reviewed change.
Status: active
Resolution:

### ASM-004
Date: 2026-09-25
Task: 00.03 — Backend Bootstrap
Assumption: Backend test and lint tooling uses the NestJS 12 scaffold defaults (Vitest, oxlint, Prettier) rather than Jest/ESLint.
Reason: The scaffold is the current idiomatic NestJS setup; no doc mandates a specific unit test or linter framework.
Impact: CI (Task 00.05) must invoke these scripts. Docs may reference vitest/oxlint going forward.
Status: active
Resolution:

### ASM-005
Date: 2026-09-25
Task: 00.03 — Backend Bootstrap
Assumption: Typed backend configuration is implemented with @nestjs/config plus a typed configuration factory in src/config/configuration.ts.
Reason: AGENTS.md lists configuration as a bootstrap requirement without prescribing a library; @nestjs/config is the standard NestJS approach.
Impact: Later backend tasks (02.01+) may evolve validation and structure of configuration.
Status: active
Resolution:

### ASM-006
Date: 2026-09-25
Task: 00.04 — Flutter Bootstrap
Assumption: Flutter app uses organization `com.minimart` and project/package name `pos` in apps/pos.
Reason: `com.minimart` matches the project's reverse-domain identity intent; `pos` is the short app identifier. No doc prescribed a specific org/project name.
Impact: Package/bundle identifiers (and later platform signing identities) derive from `com.minimart`; renaming later is disruptive, so treat `pos`/`com.minimart` as the app identity unless explicitly changed.
Status: active
Resolution:

### ASM-007
Date: 2026-09-25
Task: 00.04 — Flutter Bootstrap
Assumption: Routing/DI foundation uses the documented stack GoRouter + GetIt + Injectable with generated `injection.config.dart`; BLoC/Cubit, Drift (SQLite), Dio, and Freezed are intentionally deferred to their later phases.
Reason: ARCHITECTURE.md names these technologies; the 00.04 plan limits scope to routing + DI foundation. Injectable 3.x names the config output after the annotated file (`injection.config.dart`).
Impact: Route table and DI registrations will grow in later phases; BLoC providers and repositories get registered through the same container.
Status: active
Resolution:

### ASM-008
Date: 2026-09-25
Task: 00.05 — CI Foundation
Assumption: CI is implemented as a GitHub Actions workflow in .github/workflows/ci.yml.
Reason: The repository tracks branch `main` and no CI provider is documented anywhere in /brain or /docs; GitHub Actions is the default for Flutter/NestJS monorepos and needs no external account beyond the (future) GitHub remote.
Impact: When the repo is pushed to another CI provider, the workflow must be ported (a small config change). Live CI execution cannot be verified until a remote exists; commands were verified locally instead.
Status: resolved
Resolution: 2026-09-25 — Initial commit pushed to https://github.com/Anuragmagar/minimart-os; CI run 36087189717 executed all three jobs green (Backend 22s, Flutter Windows build 4m31s, Flutter format/analyze/test 1m35s).

### ASM-009
Date: 2026-09-25
Task: 00.06 — Foundation Audit
Assumption: The Task 00.06 audit report (brain/FOUNDATION_AUDIT.md) serves as the Foundation compatibility review referenced by AGENTS.md section 9 ("subject to the Foundation compatibility review before being treated as locked"), and the proposed stack is treated as LOCKED for Phase 01+.
Reason: AGENTS.md defers locking the stack to a compatibility review; this audit verified toolchain health, dependency resolution, builds, tests, and architecture alignment with a PASS verdict, and no other review mechanism is defined.
Impact: Subsequent phases must not silently switch stack components; any change requires a recorded decision (see/docs/decisions/). Follow-up actions (initial commit, GitHub remote, CI activation) remain open.
Status: active
Resolution:

### ASM-010
Date: 2026-09-25
Task: 01.01 — Organization Schema
Assumption: Organization master-data `status` values are exactly `active` and `inactive`, implemented as a PostgreSQL enum column (`OrganizationStatus`) with DB default `active`; `currency` is required with no default value.
Reason: DOMAIN_MODEL lists `status` on Organization but defines no allowed values; a DB-level enum is the most restrictive safe constraint and `active` is the natural creation state. Currency must always be explicit per organization; inventing a default would be an unsupported business rule.
Impact: A third status value requires a reviewed migration. New master entities should reuse the same status-pattern (or an explicit decision to differ).
Status: active
Resolution:

### ASM-011
Date: 2026-09-25
Task: 01.01 — Organization Schema
Assumption: Database access follows Prisma 7 (7.10.0) conventions: prisma7.config.ts with dotenv, `prisma-client` generator emitting to src/generated/prisma (gitignored, regenerated via postinstall/npm run prisma:generate), migrations under prisma/migrations applied by `prisma migrate dev`/`deploy`, snake_case DB identifiers via @map/@@map, and a dedicated integration test database `minimart_test` provisioned on the fly by test/db suites.
Reason: Prisma 7 is the current major and its v7 generator/client + @prisma/adapter-pg runtime pattern was validated (schema valid, migrations applied, client constructs over the driver adapter). docs/DATABASE_CONVENTIONS.md mandates snake_case identifiers.
Impact: Later schema tasks (01.02+) follow the same generator/config/test pattern; test/db requires a reachable PostgreSQL. Prisma 7's `migrate dev` does not auto-generate the client; npm run prisma:generate must be run after schema edits.
Status: active
Resolution:

### ASM-012
Date: 2026-09-25
Task: 01.02 — Store Schema
Assumption: Register.device_id is a nullable UUID column with no foreign key constraint until the devices table exists (Task 01.11); the FK will be added when Device is created (or during Task 01.12 constraints).
Reason: DOMAIN_MODEL.md lists device_id on Register, but the Device entity is defined later (01.11 Audit/Sync Schema). A dangling FK cannot be created before its parent table exists, so the pending link is explicitly recorded rather than invented.
Impact: Task 01.11 or 01.12 must add the REFERENCES constraint. Until then device_id is unconstrained at the DB level (application must treat it as a soft reference).
Status: resolved
Resolution: Task 01.11 created devices and added `registers_device_id_key` (UNIQUE) plus `registers_device_id_fkey` (RESTRICT) in migration add_audit_sync_schema; the register↔device link is now bidirectional via `devices.register_id` (1:1, ASM-023e).

### ASM-013
Date: 2026-09-25
Task: 01.03 — User/RBAC Schema
Assumption: (a) User login identifiers are separate nullable `email` and `phone` columns, each globally unique; requiring at least one of them is enforced by the application/auth layer, not by a DB CHECK (no documented business rule defines the rule). (b) Role is organization-scoped (unique organization_id + code); Permission is a global catalog (globally unique code).
Reason: DOMAIN_MODEL lists "email/phone" without a shape for user login; email and phone both as optional columns with DB-level uniqueness is the least-restrictive model consistent with Nepal mini-mart staffing (phone logins). BRAIN.md ("Organization → Users → Roles → Permissions") plus BR-025/BR-026 and tenancy imply org-scoped roles; permission codes (SECURITY.md examples) are shared application-level codes.
Impact: Registration logic must require email or phone. Cross-organization identity sharing (same email in two organizations) is intentionally blocked because email/phone are globally unique. Permission seeding (Task 01.13) should follow the SECURITY.md code format `domain:action`.
Status: active
Resolution:

### ASM-014
Date: 2026-09-25
Task: 01.04 — Product Schema
Assumption: (a) Product parent references (category_id, brand_id, unit_id), money fields (default_purchase_price, default_selling_price), reorder fields, and description are nullable; the application layer requires them where a business rule needs them. (b) products.tax_category_id is a nullable scalar column now; its FK is added in Task 01.05 together with the TaxCategory table (same pattern as ASM-012). (c) product_barcodes denormalizes organization_id so a barcode value is unique within an organization (DATABASE_CONVENTIONS "product barcodes within organization"); exactly one primary barcode per product is application-enforced because Prisma cannot express partial unique indexes. (d) unit_conversions.multiplier is DECIMAL(14,6) — no convention covers conversion factors, so precision 6 is chosen (money=2, quantity=3, multiplier can be fractional). (e) scoped-name uniqueness (category/brand name per organization; unit code per organization) follows the established scoped-identifier pattern from DATABASE_CONVENTIONS.
Reason: DOMAIN_MODEL omits types/nullability for these fields; the least-restrictive schema avoids inventing business rules while the conventions supply scoping/uniqueness guidance. ProductPrice (price periods) is explicitly Task 01.05, so product defaults here are just master-data defaults.
Impact: App/product service must enforce required parents, primary-barcode rules, and at-least-one-price before selling. Measurement/precision behavior of quantities is governed by unit.precision at the application layer.
Status: active
Resolution:

### ASM-015
Date: 2026-09-25
Task: 01.05 — Pricing and Tax Schema
Assumption: (a) TaxCategory is organization-scoped (organization_id NOT NULL, unique (org, code)) — DOMAIN_MODEL omits organization_id on TaxCategory, but BR-036 (tax behavior configurable and effective-dated) and the tenancy convention make it org config; a global catalog would let one organization's rate changes leak into another's products (BR-040). (b) Each TaxCategory row is a single effective-dated definition (effective_from required, effective_to optional); rate changes edit the row and are captured by the audit log (01.11/01.15), while sales snapshot the rate at sale time, so historical correctness does not depend on versioned rate rows. (c) tax_categories.rate is DECIMAL(14,4) — tax rates can be fractional and existing conventions cover money (2) and quantity (3) only; 4 decimals chosen for rates. (d) tax_type and product_prices.price_type are free TEXT, not enums — no authoritative value list exists (AGENTS never invents enum values). (e) ProductPrice has no status and no period-overlap constraint; a price period is retired by effective_to and overlap conflicts (same product+price_type+period) are application-enforced because Prisma cannot express exclusion constraints. No uniqueness on (product, price_type) so a product's price history is preserved.
Reason: DOMAIN_MODEL lists TaxCategory without org and ProductPrice without status/constraints; the chosen shapes follow the governing conventions (tenancy, effective-dated config, snapshots for immutable records) while staying least-restrictive where no rule exists.
Impact: TaxCategory/ProductPrice services must validate effective windows (effective_to > effective_from) and disallow overlapping active periods. Creating TaxCategory seeds (e.g. Nepal VAT) is deferred to Task 01.13; no rate values are assumed here.
Status: active
Resolution:

### ASM-016
Date: 2026-09-25
Task: 01.06 — Inventory Schema
Assumption: product_batches.supplier_id is a nullable scalar column now; its FK (RESTRICT) is added in Task 01.07 when the Supplier table is created (same deferral pattern as ASM-012/ASM-014). ProductBatch always belongs to a product (product_id NOT NULL); batch_number is NOT unique at the DB level because two suppliers may issue identical batch numbers and no rule defines scoped uniqueness.
Reason: DOMAIN_MODEL lists supplier_id on ProductBatch, but Task 01.06 runs before Task 01.07 (Purchasing/Suppliers); the established deferred-FK pattern keeps migrations safe.
Impact: Batch receiving will link supplier once 01.07 lands; until then supplier_id stays NULL on DB insert.
Status: resolved
Resolution: Task 01.07 added the suppliers table and `product_batches_supplier_id_fkey` (RESTRICT) in migration add_purchase_schema; supplier_id is now linked.

### ASM-018
Date: 2026-09-25
Task: 01.07 — Purchasing Schema
Assumption: (a) purchase_orders.status and goods_receipts.status are free TEXT, not enums — the authoritative draft/ordered/received/etc. value lists are undocumented (AGENTS never invents enum values); the application layer defines workflow codes. (b) PurchaseOrder money columns (sub_total/discount_amount/tax_amount/total) are order-time snapshots computed by the application; the DB only stores them (TRANSAXION atomicity is handled at use-case level). (c) SupplierLedgerEntry.entry_type is TEXT ('debit'/'credit' semantics are application-verified; debit increases supplier receivable, credit decreases it); balance_after snapshot columns are app-maintained. (d) There is no purchase order number field — document identity is the UUID id; any bill/receipt number for Nepal compliance is configured later via the reference field or a future compliance task. (e) SupplierPayment has no organization_id: suppliers are org-scoped and payment links the supplier only, per DOMAIN_MODEL.
Reason: DOMAIN_MODEL omits status enums, PO numbering, entry_type enums, and org columns on purchasing transactions; no authoritative source defines these.
Impact: Purchasing use cases own status transitions, total computation, and ledger balance maintenance; schema remains a thin, extensible store.
Status: active
Resolution:

### ASM-017
Date: 2026-09-25
Task: 01.06 — Inventory Schema
Assumption: (a) InventoryMovement.quantity is a SIGNED NUMERIC(14,3) — positive = inbound, negative = outbound; DOMAIN_MODEL lists quantity without sign semantics. (b) movement_type, stock_adjustments.status and stock_transfers.status are free TEXT, not enums — the authoritative value lists are undocumented (AGENTS never invents enum values); the application enforcement defines allowed workflow codes (e.g., receipt/sale/adjustment/transfer types and draft/pending/approved/rejected/completed statuses). (c) InventoryBalance.batch_id is nullable to support both product-level balances (NULL) and batch-level balances; a uniqueness rule (location, product, batch) cannot be a DB unique index because NULL batch would let duplicates slip through — balance identity is application-managed. reserved/available are projection columns with default 0. (d) InventoryMovement denormalizes organization_id (per DOMAIN_MODEL) and created_by references users RESTRICT but is nullable (system-originated movements have no actor). (e) StockAdjustment/StockTransfer rows carry their own status; executing them creates InventoryMovement rows (BR-005) at the application layer, and item quantities are signed.
Reason: BR-004/BR-005/BR-006 (ledger is authoritative, balance is a projection) require signed movements and a mutable projection; DOMAIN_MODEL does not define sign conventions, status value lists, or balance-batch semantics.
Impact: Movement postings, FEFO picking and the balance-rebuild service must respect sign conventions and app-managed statuses/balance identity. `version` on balances enables optimistic locking.
Status: active
Resolution:

### ASM-019
Date: 2026-09-25
Task: 01.08 — Customer Schema
Assumption: Customer carries an org-scoped `code` with DB unique constraint (organization_id, code), even though DOMAIN_MODEL lists only organization_id, name, phone, address, credit_limit, status. Code is used because every other org-scoped master entity (store, supplier, product, tax category) follows the same (org, code) identity pattern and khata needs a stable business identifier for receipts/ledger references.
Reason: DOMAIN_MODEL omits a customer code but does not forbid one; the org-scoped unique-code convention is already established in this schema (ASM-006/ASM-014 pattern).
Impact: Customer addressing in sales (Task 01.09), khata ledger and offline sync uses the code; name-only matching would be ambiguous.
Status: active
Resolution:

### ASM-020
Date: 2026-09-25
Task: 01.09 — Sales Schema
Assumption: sales.cash_session_id is a nullable scalar column with NO FK now; its FK (RESTRICT) is added in Task 01.10 when the cash_sessions table is created (same deferral pattern as ASM-012/ASM-014/ASM-016). DOMAIN_MODEL lists "cash session" on Sale but the cash schema runs after the sales schema.
Reason: Prisma cannot create an FK to a non-existent table; run order forces the deferral.
Impact: Sales created before 01.10 have no cash-session link; the FK is linked additively in the next task.
Status: resolved
Resolution: Task 01.10 created cash_sessions and added `sales_cash_session_id_fkey` (RESTRICT) in migration add_expense_cash_schema; sales now link to their session.

### ASM-022
Date: 2026-09-25
Task: 01.10 — Expense/Cash Schema
Assumption: (a) cash_session.status, cash_movement.type and expense.payment_method are free TEXT — value lists are undocumented; the application layer defines workflow codes. The literal status string 'open' is RESERVED for an active session: a hand-written partial unique index `cash_sessions_register_open_key` (UNIQUE on register_id WHERE status='open') enforces BR-032 (one active session per register) at the database level. (b) CashSession money columns (opening/expected/actual/variance) are DECIMAL(14,2) snapshots computed at open/close by the application; expected = opening + cash in − cash out − refunds (per BR-023 only cash affects the drawer). (c) expense.occurred_at and cash_movement.occurred_at carry local device time for offline capture; no org column on expenses (DOMAIN_MODEL omits it; org reachable via store) while cash_sessions denormalize organization_id per DOMAIN_MODEL. (d) cash_sessions.cashier_id is nullable (system-open sessions allowed); closing sets actual summing cash movements app-side.
Reason: BR-032 mandates single active session but the status value list is undefined; DOMAIN_MODEL omits expense org, movement types, and status enums.
Impact: The cash-close service must use status 'open' for active sessions or the partial index (and BR-032) is bypassed; expense/cash movement types are documented in application code.
Status: active
Resolution:

### ASM-021
Date: 2026-09-25
Task: 01.09 — Sales Schema
Assumption: (a) sale.status, payment.status, sale_return.status and invoice.status are free TEXT, not enums — value lists are undocumented (AGENTS never invents enum values); the application layer defines workflow codes (e.g., created/paid/voided, pending/captured/refunded, completed/cancelled, issued/cancelled). (b) sales.operation_id and sale_returns.operation_id are NOT NULL UNIQUE because BR-038 (server processes each operation ID at most once) is enforced at the row level for these single-row-per-operation documents, unlike inventory_movements where one operation fans out to many rows (plain index, ASM-017d). operation_id is client-generated per BR-037. (c) sale.sale_number and invoice.invoice_number are NOT NULL but NOT unique — numbering rules are undocumented (per-store/register sequences, fiscal-year resets, compliance formats); uniqueness is application-managed per store with conflict retry, mirroring ASM-016 batch numbers. (d) SaleItem snapshots name/sku/barcode + unit_cost/cost_total per BR-008/BR-019; discount_amount and tax_amount on sale/sale_item are order-time snapshots of DECIMAL(14,2). (e) Payment denormalizes organization_id per DOMAIN_MODEL but not store (reachable via sale). (f) SaleReturn.sale_id is nullable per DOMAIN_MODEL ("original sale" optional) so returns without an original sale are allowed, mirroring goods_receipts.purchase_order_id; SaleReturnItem.sale_item_id is likewise nullable. (g) Invoice carries seller/customer TEXT snapshots and DECIMAL(14,2) tax totals, status TEXT.
Reason: BR-028/BR-030/BR-031 require atomic, idempotent, snapshot-preserving sale/return/refund documents; DOMAIN_MODEL omits status enums, numbering schemes and nullability.
Impact: Sale/return/invoice services own numbering, status transitions, and total computation; DB guarantees idempotency via unique operation ids and immutability via RESTRICT.
Status: active
Resolution:

### ASM-023
Date: 2026-09-25
Task: 01.11 — Audit/Sync Schema
Assumption: (a) Device.status is free TEXT defaulting to 'active' — the device state/value list is undocumented; identity is `name` + `device_type` + unique register link. last_online_at/last_sync_at drive OFFLINE_SYNC monitoring (pending/failed/conflict counts are computed from sync_operations, not stored). (b) AuditLog.organization_id is required, but store/user/device are nullable because AGENTS 25 says "store where applicable" (org-level/system actions exist); action, entity and entity_id are TEXT — entity_id must accept non-UUID identifiers for heterogeneous entities so it deliberately has NO uuid typing and NO FK; before/after are nullable Json (jsonb) diffs. AuditLog has NO updated_at and no update path (BR-007/BR-039 immutability). (c) SyncOperation.state values are the documented OFFLINE_SYNC tokens stored verbatim (PENDING/SYNCING/APPLIED/FAILED/RETRY/CONFLICT/MANUAL_RESOLUTION/REJECTED), TEXT default 'PENDING'; operation_id is NOT NULL UNIQUE (BR-038 idempotency, same pattern as ASM-021b) and is client-generated (BR-037); payload_ref is a TEXT reference to stored operation payload (domain id or blob key); attempts Int default 0 at DB level; last_error TEXT records the retry reason. (d) Conflict has exactly one row per sync operation (@unique), local_data/server_data are NOT NULL jsonb snapshots, resolution TEXT nullable, resolver = User nullable (allows the OFFLINE_SYNC automated "server wins" path) with resolved_at timestamp. (e) Device↔Register is a bidirectional 1:1 enforced by TWO FKs: registers.device_id → devices (closes ASM-012) and devices.register_id → registers; the application must keep both paths consistent.
Reason: OFFLINE_SYNC.md documents the state machine and BR-038 the idempotency keying; DOMAIN_MODEL does not fix status value lists, auditnullability, payload references, or how the two register/device FKs interact.
Impact: Sync service owns state transitions and payload storage; audit service owns diffs; any new sync state must extend the documented token list. Device/register linking is set once at device enrollment.
Status: active
Resolution:

### ASM-024
Date: 2026-09-25
Task: 01.12 — Constraints and Indexes
Assumption: (a) BR-016 ("negative stock handling is disabled by default") is interpreted as: the inventory_balances projection must never go negative, enforced by a database CHECK constraint `inventory_balances_non_negative` (quantity_on_hand/reserved/available >= 0) in the migration SQL (raw SQL, not Prisma-level, matching the BR-032 one-open-session index precedent). Re-enabling negative stock later is possible only via a reviewed additive migration that drops this constraint. (b) BR-006 "exactly one balance per location/product/batch" is enforced by a hand-written NULL-safe UNIQUE index `inventory_balances_location_product_batch_key` on (location_id, product_id, COALESCE(batch_id, '00000000-0000-0000-0000-000000000000')) so the unbatchable per-product line (NULL batch) and every batch-level line share one unique dimension; Prisma `migrate diff` does not emit the index because it is raw SQL (verified: the 01.11 partial index generated no DROP). (c) Ten child-side FK columns got plain @@index (non-unique): categories.parent_id, user_roles.role_id, role_permissions.permission_id, unit_conversions.to_unit_id, product_barcodes.product_id, purchase_order_items.purchase_order_id, goods_receipt_items.receipt_id, sale_items.sale_id, sale_item_allocations.sale_item_id, sale_return_items.return_id — so CASCADE parent deletes traverse child indexes; these are additive and do not alter semantics.
Reason: BR-016 leaves negative-stock handling as a configurable policy with a default; BR-006 prescribes a single projection row per dimension which NULL batch would otherwise duplicate; the plan's objective is structural integrity indexes.
Impact: Inventory services must never write negative projections (any such write is rejected by the DB); creating a second balance row for the same (location, product, batch) or for the same product's unbatchable line is rejected; app code may rely on unique lookups by the composite.
Status: active
Resolution:

### ASM-025
Date: 2026-09-25
Task: 01.13 — Seed Data
Assumption: The development seed (services/api/prisma/seed.ts, `npm run seed` / `npx prisma db seed`) is DEV-ONLY reference + demo master data and deliberately contains NO financial/ledger rows: no inventory_balances, no inventory_movements, no sales/payments/cash sessions/expense documents, no ledger entries, no purchase orders/receipts — seeding balances without movements would falsify the BR-005/BR-014 ledger, so receiving (→ movements + balances + batches) belongs to the purchasing/inventory application. (a) Permission catalog = exactly the 20 codes documented in brain/SECURITY.md (global catalog per ASM-013, `domain:action`, no invented codes); the demo mappings owner=all 20, manager=17 (excludes users:manage/roles:manage), cashier=8 (sales/inventory-view/customers-view/cash/reports-sales) are demo defaults the RBAC task (04.06/04.07) owns. (b) Tax seed VAT-STD: rate 13.0000, tax_type 'VAT', effective_from 2005-01-14 — the standard single rate in force since 14 Jan 2005 under VAT Act 2052 §7(1) and unchanged into FY 2083/84 (Finance Bill 2083 keeps 13% standard and adds 5% carve-outs for ride-hailing/electricity from 17 Jul 2026); verified against authoritative sources on 2026-09-25. Seed row is DATA, not business logic (AGENTS 24); rate changes must be data-driven. (c) Demo users use scrypt (node:crypto, parameters 16384/8/1, 32-byte key, fixed dev salt) — NOT plaintext and never MD5/SHA1 — but the production password algorithm remains the auth task's choice (ASM-013); dev password `MinimartDev@123` is printed on seed run and is local-only; demo emails use the reserved `.local` TLD so they never collide with real identities. (d) product_prices.price_type literal 'retail' for seeded prices follows ASM-014d (application-defined tokens); batch numbers `BATCH-<SKU>-001` and demo phone numbers/PAN-less org are invented dev data with no real-world references. (e) Idempotency: every row upserts on its natural key (permissions.code, (org,code) where org-scoped, (org,sku) products, (org,email) users); org/store/registers use fixed seed UUIDs so reruns never duplicate and child links resolve deterministically; product batches/prices (no unique key) are matched by (product, batch_number) / first-retail-price and updated in place.
Reason: "Safe development seed data" was scoped by the user, not the docs; deferred items (permission catalog ASM-013/01.03, tax values ASM-015/01.05) plus demo master data needed materialized token/value decisions + a credential hash before the auth task exists.
Impact: Run `npm run seed` against the DEV database only; CI and tests use the seed programmatically against the ephemeral test DB. Anything financial still starts empty. The auth phase must own real password hashing/rotation and may rehash the demo users on first login.
Status: active
Resolution:

### ASM-026
Date: 2026-09-26
Task: 02.07 — Authentication Foundation
Assumption: (a) Password hashing uses Argon2id (SECURITY.md preferred algorithm) via @node-rs/argon2; default parameters 19456 KiB memory cost, time cost 2, parallelism 1 (OWASP-recommended baseline, library defaults) are data-driven via ARGON2_MEMORY_COST/ARGON2_TIME_COST/ARGON2_PARALLELISM env vars. (b) Token lifetimes are data-driven placeholders: ACCESS_TOKEN_TTL_SECONDS default 900 (15 min short-lived access per SECURITY.md) and REFRESH_TOKEN_TTL_SECONDS default 604800 (7 days rotating refresh) — exact durations are NOT set by any authoritative document and Phase 04 (02/03 refresh/access tasks) is permitted to change defaults without a schema migration. (c) The AuthModule (02.07) deliberately implements NO endpoints, token issuance, revocation or sessions — those are Phase 04 tasks (04.01 Login, 04.02 Access Token, 04.03 Refresh Token, 04.04 Logout); the demo users' existing scrypt hashes (ASM-025c) are handled by rehash-on-first-login in Phase 04, not here.
Reason: SECURITY.md states Argon2id preference and short-lived-access/rotating-refresh shape but not exact parameters or durations; no authoritative source documents them. PasswordService must exist before any Phase 04 login flow can verify credentials.
Impact: Any Argon2id hash produced is PHC-encoded ($argon2id$v=19$...) and self-describing, so later parameter changes require no migration; token TTL values are read from config so Phase 04 can tune them without code changes.
Status: active
Resolution:

### ASM-027
Date: 2026-09-26
Task: 02.08 � Repository Patterns
Assumption: (a) Repository interfaces are expressed as abstract classes (e.g. OrganizationRepository) so they work as NestJS DI provider tokens (TS interfaces are erased and unusable as tokens); abstract classes MUST define only method signatures, never concrete behavior. Prisma implementations extend BaseRepository (which exposes the PrismaClient) and are bound via { provide: <AbstractRepository>, useClass: Prisma<Entity>Repository }. (b) BaseRepository exposes the full PrismaClient (BaseRepository.client) to implementations; repositories are NOT wrapped with per-repository mockability layers because the unit-test boundary is the repository's own methods (tests mock the PrismaService client), and Prisma integration is proven by the test/db harness. (c) DatabaseModule is @Global (PrismaService available app-wide) matching the AppConfigModule/LoggingModule precedent; feature modules bind their own repository providers/exports. (d) PrismaService constructs PrismaClient + PrismaPg driver adapter once from AppConfigService.databaseUrl and disconnects on module destroy (OnModuleDestroy); connection is established lazily by the adapter on first query (no eager ) - matches the test/db spec harness and avoids holding a dev connection when the API runs before migrations.
Reason: Architecture mandates Repository Interface -> Infrastructure; NestJS DI needs runtime tokens; the repo's own DB specs already establish the PrismaPg + lazy-connect client pattern.
Impact: All future feature repositories must follow this shape; swapping Prisma for another infrastructure later only replaces the implementations, not the interfaces or consumers.
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
Assumption: (a) The core infrastructure integration test boots the full real AppModule (all core modules wired: AppConfigModule, LoggingModule, HealthModule, AuthModule, DatabaseModule, OrganizationsModule, AuditModule, IdempotencyModule) against a provisioned minimart_test database, exercising the complete HTTP → filter/interceptor/pipe → service → repository → DB stack. (b) The test uses a mocked AppConfigService with getter-based overrides (not getOrThrow) because LoggingModule accesses config.logLevel via getter; this is a test-only accommodation. (c) OrganizationRepository is exercised through the real DI container (orgRepo.findById(id, tx?)) against the real test DB, verifying tx-aware repository routing works inside the full app context. (d) PrismaService.runInTransaction commit/rollback/visibility is tested end-to-end through the real PrismaService instance in the app container. (e) AuditService.record and IdempotencyService.execute are invoked through the real DI container and their writes are verified against the real test DB, confirming the modules integrate correctly with the transaction infrastructure. (f) The test creates necessary FK-dependent rows (store for audit_logs) inline since the test DB is fresh per run. (g) No business controllers exist yet (only AppController/HealthController); the integration test focuses on the core infrastructure wiring and the services accessible via DI, not HTTP business endpoints.
Reason: Plan objective 02.12 "Test core infrastructure" requires proving the entire backend core (config, logging, error handling, validation, response format, versioning, database, repositories, transactions, idempotency, audit) works together as a coherent stack against a real database. The test:db suite already covers schema/repo/service units; this test adds the full AppModule boot + HTTP stack + DI-wired services integration verification.
Impact: Provides confidence that the core backend infrastructure is correctly assembled and functional before building business use-cases. Catches wiring issues (DI overrides, module imports, transaction routing, FK constraints) that unit/db/individual e2e tests miss.
Status: active
Resolution:

### ASM-032
Date: 2026-09-26
Task: 02.13 - Backend Audit
Assumption: (a) The audit reviews the complete Phase 02 backend core (02.01-02.12) against AGENTS.md architecture rules (§9-27), business rules (BR-001 to BR-040), SECURITY.md requirements, and Phase 02 plan objectives. (b) Infrastructure components (config, logging, error handling, validation, response format, versioning, auth foundation, repositories, transactions, idempotency, audit) are all implemented and tested per plan; business use-cases (sales, purchases, inventory, customers, cash) are explicitly out of scope for Phase 02. (c) RBAC enforcement on HTTP endpoints is deferred to Phase 04 (auth) — the permissions catalog exists (01.13) but guards/interceptors are not yet applied. (d) Weighted Average Cost calculation is deferred to Phase 03+ — schema supports batch-level unit_cost and movement-level cost tracking. (e) Offline POS and synchronization implementation is deferred to Phase 03+ — schema foundation (devices, sync_operations, conflicts) exists. (f) All 333 tests (82 unit + 13 e2e + 238 DB) pass; no critical, major, or blocking findings identified. (d) Deferred items are explicitly documented and do not violate AGENTS.md STOP conditions (no unknown compliance behavior, no invented business rules, no destructive migrations, no security ambiguity).
Reason: AGENTS.md §27 requires a comprehensive self-audit before task completion. Phase 02 objective is backend core infrastructure; this audit confirms all plan tasks (02.01-02.13) are satisfied with appropriate test coverage and no architectural violations.
Impact: Phase 02 (Backend Core) marked COMPLETE. Ready for Phase 03 (Business Use-Cases) and Phase 04 (Authentication/Authorization).
Status: active
Resolution:
