# MiniMart OS — OpenCode Engineering Instructions

## 1. PRIMARY OBJECTIVE
Build MiniMart OS as a production-quality retail management and POS system for Nepal-focused mini-mart operations.

The system must support:
- POS sales
- barcode scanning
- product management
- inventory
- batches and expiry
- FEFO
- purchasing
- suppliers
- customers
- credit / Khata
- payments
- cash register
- returns
- expenses
- reports
- RBAC
- audit logging
- offline POS
- synchronization
- configurable Nepal tax/compliance
- multiple stores
- multiple registers
- multiple users

Initial deployment is one physical mini-mart. The architecture must support future multi-store operation.

## 2. AGENT ROLE
Act as a senior software engineer, architect, database engineer, security engineer, QA engineer, and code reviewer.

Do not behave as an autonomous product designer. Requirements and architecture are defined by project documentation.

## 3. MANDATORY READING ORDER
Before modifying code, read:
1. `/AGENTS.md`
2. `/brain/BRAIN.md`
3. `/brain/CURRENT_STATE.md`
4. relevant `/brain/*.md`
5. relevant `/plans/*.md`
6. existing implementation related to the task

## 4. SOURCE OF TRUTH
Priority:
1. Explicit current user instruction
2. AGENTS.md
3. BRAIN.md
4. Approved architecture documentation
5. Business rules
6. Approved task specification
7. Current implementation
8. Existing conventions
9. Assumptions

If authoritative sources conflict: STOP and report the conflict.

## 5. NO-ASSUMPTION POLICY
Never invent business rules, tax rates, accounting rules, government API behavior, payment-provider behavior, compliance requirements, database relationships, authorization rules, synchronization behavior, or permissions.

If required information is missing:
- Blocking uncertainty: STOP and ask.
- Non-blocking uncertainty: use an existing documented decision.
- If no decision exists, record the assumption in `/brain/ASSUMPTIONS.md` and report it.

## 6. TASK BOUNDARY
Only implement the explicitly requested task.
Do not automatically continue to the next task.
Do not implement speculative features.
Do not refactor unrelated modules.
Do not upgrade dependencies without justification.
Do not redesign architecture without approval.

## 7. IMPLEMENTATION WORKFLOW
READ → INSPECT → UNDERSTAND → PLAN → IDENTIFY UNCERTAINTIES → IMPLEMENT → TEST → SELF-AUDIT → UPDATE STATE → REPORT

## 8. BEFORE CODING
Inspect:
- repository structure
- relevant modules
- interfaces
- database schema
- existing tests
- related business logic
- dependencies
- conflicts
- expected changed files

Do not rewrite existing code merely because another design seems preferable.

## 9. ARCHITECTURE
Primary proposal:
- Flutter
- BLoC/Cubit
- GoRouter
- GetIt + Injectable
- Drift + SQLite
- Dio
- Freezed/JSON serialization
- NestJS + TypeScript
- PostgreSQL
- Prisma
- Redis
- REST
- Docker
- modular monolith
- Clean Architecture + feature-first

These choices are subject to the Foundation compatibility review before being treated as locked.

## 10. FRONTEND ARCHITECTURE
Typical dependency direction:
Presentation → Application/Use Cases → Domain → Repository Interfaces → Data Sources

Widgets must not directly call Dio or repositories.

## 11. BACKEND ARCHITECTURE
Preferred flow:
Controller → Application Service/Use Case → Domain Logic → Repository → Prisma → PostgreSQL

Controllers remain thin.

## 12. DATABASE PRINCIPLES
- PostgreSQL is centralized server source of truth.
- UUID primary keys.
- TIMESTAMPTZ UTC.
- Asia/Kathmandu as application timezone.
- NUMERIC(14,2) for money.
- NUMERIC(14,3) for quantity.
- No floating point for money.

## 13. TENANCY
Every business belongs to an Organization.
Operational transactions belong to a Store.
Authorization scope must be derived server-side.
Never trust client-supplied organization/store IDs for authorization.

## 14. INVENTORY
Inventory is ledger-based.
Never use `products.stock` as the authoritative inventory source.
Inventory changes create InventoryMovement records.
InventoryBalance is a current-state projection.

## 15. FINANCIAL IMMUTABILITY
Posted sales, invoices, payments, goods receipts, supplier/customer ledger entries, inventory movements, and cash movements must not be directly edited/deleted.
Corrections use returns, reversals, adjustments, or corrective transactions.

## 16. COSTING
Physical allocation: FEFO.
Financial inventory costing: Weighted Average Cost.
Historical sale cost must be preserved.

## 17. OFFLINE-FIRST POS
POS must work without internet.
SQLite is an operational local database.
Important operations require unique operation IDs.
Server processing must be idempotent.

## 18. SYNCHRONIZATION
Synchronize business operations rather than arbitrary database mutations.
Inventory synchronizes through movements.
Duplicate operations must never create duplicate transactions.
Disconnected multi-device conflicts must be explicit.

## 19. SECURITY
Never:
- store plaintext passwords
- use MD5/SHA1 for password storage
- commit secrets
- expose PostgreSQL publicly
- trust client authorization
- bypass backend permissions
- log passwords/tokens/secrets

Use secure authentication, RBAC, validation, rate limiting, audit logging, HTTPS in production, and secure local credential storage.

## 20. BUSINESS RULES
Canonical rules are in `/brain/BUSINESS_RULES.md`.

Important invariants:
- Inventory: opening + inbound - outbound = closing
- Customer receivable: opening + credit sales - payments - credits = closing
- Supplier payable: opening + credit purchases - payments - credits = closing
- Cash: opening + cash sales + deposits - refunds - expenses - withdrawals = expected cash

## 21. TRANSACTIONS
Multi-entity business operations must be atomic, including:
- sale completion
- goods receipt
- returns
- stock adjustments
- stock transfers
- customer/supplier payments
- cash closing

## 22. IDEMPOTENCY
Business commands must support idempotency via operation IDs and/or Idempotency-Key.
Same operation + same request returns original result.
Same operation + different request returns conflict.

## 23. CONCURRENCY
Critical inventory and financial operations require database transactions and appropriate locking/concurrency controls.

## 24. TAX
Never hardcode Nepal tax rates into business logic.
Tax configuration must be data-driven.
Production compliance behavior must be verified from authoritative sources.

## 25. AUDIT
Important mutations must create audit records containing user, organization, store, device where applicable, action, entity, entity ID, timestamp, and before/after data where appropriate.

## 26. TESTING
Compilation is not completion.
Relevant unit, integration, API, database, E2E, sync, security, and hardware tests are required according to task scope.

## 27. REQUIRED SELF-AUDIT
Before completion verify:
- requirements
- architecture
- database
- security
- business rules
- offline/sync
- testing
- scope
- documentation

## 28. STOP CONDITIONS
STOP before modifying code if:
- requirements conflict
- required behavior is undefined
- implementation requires inventing a business rule
- compliance behavior is unknown
- security behavior is ambiguous
- architecture conflicts
- migration may cause destructive data loss
- historical financial data could be corrupted

## 29. COMPLETION REPORT
Every task must report:
TASK
STATUS
SUMMARY
FILES CREATED
FILES MODIFIED
FILES DELETED
BUSINESS RULES VERIFIED
TESTS RUN
TEST RESULTS
SECURITY
OFFLINE/SYNC
ASSUMPTIONS
UNRESOLVED ISSUES
ARCHITECTURAL CHANGES
NEXT AVAILABLE TASK

Never simply report "done".
