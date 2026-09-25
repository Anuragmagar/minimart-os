# MiniMart OS — Risks

## RISK-001 — Offline Multi-Device Inventory
Disconnected POS devices can sell the same physical stock.
Mitigation: movement-based sync, explicit conflicts, controlled offline operation.

## RISK-002 — Nepal Tax/Compliance Changes
Requirements may change.
Mitigation: configuration-driven tax system, compliance adapter, authoritative-source verification.

## RISK-003 — Hardware Compatibility
Printers, scanners and drawers vary.
Mitigation: hardware abstraction and target-hardware testing.

## RISK-004 — Financial Calculation Errors
Incorrect COGS/ledger calculations can corrupt reports.
Mitigation: invariant tests, transactions, immutable history, reconciliation.

## RISK-005 — Local Database Exposure
Offline data may contain business/customer information.
Mitigation: secure storage, device security, evaluate encrypted SQLite, minimize sensitive data.

## RISK-006 — Sync Corruption
Incorrect retries may duplicate transactions.
Mitigation: operation IDs, idempotency, state machine, conflict handling.
