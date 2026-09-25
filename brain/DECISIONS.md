# MiniMart OS — Engineering Decisions

## Decision Format
Each decision should contain:
- ID
- Date
- Context
- Decision
- Alternatives
- Consequences
- Status

---

## ADR-001 — Modular Monolith
Status: Proposed
Decision: Use a modular monolith for MVP instead of microservices.
Reason: Lower operational complexity while preserving module boundaries.

## ADR-002 — Offline-First POS
Status: Proposed
Decision: POS uses local SQLite/Drift as operational storage and synchronizes with the server.

## ADR-003 — Inventory Ledger
Status: Proposed
Decision: InventoryMovement is authoritative history; InventoryBalance is a projection.

## ADR-004 — FEFO + Weighted Average
Status: Proposed
Decision: FEFO for physical batch allocation; weighted average for financial inventory costing.

## ADR-005 — REST
Status: Proposed
Decision: REST API for initial implementation. Realtime/WebSocket may be added later where justified.

## ADR-006 — PostgreSQL
Status: Proposed
Decision: PostgreSQL for centralized transactional storage.

## ADR-007 — RBAC
Status: Proposed
Decision: Backend-enforced RBAC with explicit permission codes.

## ADR-008 — Technology Stack
Status: Pending Foundation Review
Decision: Flutter/NestJS/PostgreSQL/Drift/Prisma/Redis/Docker as the proposed stack.
Action: Validate compatibility before locking.
