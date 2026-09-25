# MiniMart OS — Architecture

## Style
Modular monolith. Do not implement microservices for MVP.

## Backend Modules
auth, users, organizations, stores, products, inventory, sales, payments, purchasing, suppliers, customers, expenses, reports, tax, audit.

## Frontend Modules
auth, pos, products, inventory, purchasing, suppliers, customers, expenses, reports, settings.

## Backend Dependency
Controller → Application → Domain → Repository Interface → Infrastructure.

## Flutter Dependency
Presentation → BLoC/Cubit → Use Case → Repository → Local/Remote Data Source.

## Database
PostgreSQL. UUID primary keys. TIMESTAMPTZ UTC. NUMERIC for money and quantity.

## Local Database
Drift + SQLite for offline operational data.

## Network
Dio + REST `/api/v1`.

## Backend
NestJS + TypeScript.

## ORM
Prisma, subject to Foundation review.

## Cache
Redis is auxiliary only and never the source of truth.

## Deployment
Docker. Initial production topology:
Reverse Proxy → NestJS → PostgreSQL, with Redis as auxiliary infrastructure.

## API
Success:
`{ "data": {}, "meta": {} }`

Error:
`{ "error": { "code": "...", "message": "...", "details": {}, "field_errors": {}, "request_id": "..." } }`

## Pagination
Cursor pagination for large transaction datasets. Maximum page size 100–200.

## Concurrency
Database transactions, row locking where needed, optimistic version fields, unique constraints.

## Tenant Isolation
Organization/store scope is derived from authenticated context.

## Observability
Structured logs, request IDs, operation IDs, health checks, metrics, sync monitoring, backup monitoring.
