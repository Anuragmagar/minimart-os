# API Conventions

Base path:
`/api/v1`

## Success

```json
{
  "data": {},
  "meta": {}
}
```

## Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {},
    "field_errors": {},
    "request_id": "..."
  }
}
```

## Standard Error Codes

VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
DUPLICATE_RESOURCE
INVALID_STATE
INSUFFICIENT_STOCK
CREDIT_LIMIT_EXCEEDED
PAYMENT_FAILED
IDEMPOTENCY_CONFLICT
CONCURRENCY_CONFLICT
BUSINESS_RULE_VIOLATION
SYNC_CONFLICT
RATE_LIMITED
INTERNAL_ERROR

## Status Codes

400 malformed request
401 unauthenticated
403 unauthorized
404 missing resource
409 state/conflict/idempotency conflict
422 valid syntax but invalid business input
429 rate limited
500 unexpected server failure

## Pagination

Prefer cursor pagination for large transaction collections.

Maximum page size:
100–200.

## Filtering

Only explicitly whitelisted filters and sort fields may be accepted.
