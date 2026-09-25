# Testing Matrix

## Core Calculations
- tax
- discount
- pricing
- FEFO
- weighted average cost
- COGS
- cash expected/variance
- customer balance
- supplier balance

## POS
- normal cash sale
- credit sale
- split payment
- insufficient stock
- discount
- tax
- hold/resume
- invoice
- reprint

## Purchasing
- purchase order
- full receipt
- partial receipt
- damaged quantity
- batch/expiry
- supplier payable
- supplier payment
- purchase return

## Inventory
- stock adjustment
- transfer
- damage
- expiry
- FEFO
- negative stock prevention
- concurrent sale

## Returns
- partial return
- multiple returns
- return limit
- sellable return
- damaged return
- COGS reversal

## Offline
- offline sale
- restart before sync
- reconnect
- retry
- duplicate operation
- permanent failure
- conflict

## Security
- permission violation
- cross-store access
- cross-tenant access
- rate limiting
- token/session revocation

## Cash
- opening
- cash sale
- refund
- expense
- withdrawal
- deposit
- closing
- variance

## Invariants
Inventory:
opening + inbound - outbound = closing

Customer:
opening + credit sales - payments - credits = closing

Supplier:
opening + credit purchases - payments - credits = closing

Cash:
opening + cash sales + deposits - refunds - expenses - withdrawals = expected cash
