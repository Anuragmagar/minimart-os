# MiniMart OS — Offline and Synchronization Architecture

## Principle
POS must remain usable without internet.

## Local Authority
During offline operation, local SQLite is authoritative for the current device session. After synchronization, the server is the centralized source of truth.

## Offline Sale Transaction
Atomically write:
- Sale
- Sale Items
- Payments
- Inventory Movements
- Inventory Balance
- Cash Movement
- Customer Ledger where applicable
- Invoice
- Sync Operation

## Operation ID
Use UUID/ULID. Every important business command receives a unique operation ID.

## Sync States
PENDING → SYNCING → APPLIED
Failure → FAILED → RETRY
Conflict → CONFLICT → MANUAL_RESOLUTION
Permanent rejection → REJECTED

## Sync Triggers
Startup, login, network restoration, app resume, periodic timer, manual Sync Now.

## Push
Push business operations. Server validates and processes transactionally.

## Pull
Pull changes using a cursor/change token.

## Conflict
Example: two disconnected POS devices sell the last unit. The server must explicitly detect and resolve the conflict rather than silently overwrite inventory.

## Master Data
For future configuration/price conflicts, server generally wins. Historical transactions remain unchanged.

## External Payments
Do not mark externally verified QR/provider payments successful while offline unless the provider explicitly supports an offline-safe mechanism.

## Retry
Retry transient errors. Do not endlessly retry permanent business errors.

## Monitoring
Track device, last online, last sync, pending count, failed count, conflict count.

## Core Rule
Synchronize business operations, not arbitrary database state.
