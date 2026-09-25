# MiniMart OS — Implementation Workflow

## Development Loop

READ
↓
SELECT ONE TASK
↓
INSPECT REPOSITORY
↓
CHECK UNCERTAINTY
↓
IMPLEMENT
↓
TEST
↓
SELF-AUDIT
↓
UPDATE CURRENT_STATE
↓
INDEPENDENT AUDIT
↓
PASS?
↓
NEXT TASK

## Human Approval Gates

### Gate 1 — Foundation
No feature development until foundation review passes.

### Gate 2 — Database
No business modules until database foundation passes.

### Gate 3 — Core Domain
No POS until inventory, purchasing, products, and domain foundations are stable.

### Gate 4 — POS
No production hardware integration until sales/payment correctness is tested.

### Gate 5 — Offline Sync
No claim of multi-device offline readiness until conflict and idempotency tests pass.

### Gate 6 — Compliance
No production compliance claim without authoritative verification.

### Gate 7 — Production
No production release until final audit and restore testing pass.
