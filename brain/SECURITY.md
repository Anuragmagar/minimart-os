# MiniMart OS — Security Requirements

## Authentication
Preferred password hashing: Argon2id. Properly configured bcrypt is acceptable if justified.

## Tokens
Short-lived access token + rotating refresh token. Sessions must be revocable.

## Permissions
Examples:
products:manage
products:create
products:update
products:deactivate
sales:create
sales:return
sales:void
inventory:view
inventory:adjust
inventory:transfer
purchasing:create
purchasing:receive
customers:view
customers:credit
reports:sales
reports:profit
cash:open
cash:close
cash:withdraw
users:manage
roles:manage

## Tenant Isolation
All organization/store-scoped queries must be authorized server-side.

## Local Security
Store tokens/device secrets in OS secure storage. Never store passwords locally.

## API
Validation, rate limiting, payload limits, CORS, security headers, HTTPS, timeouts.

## Secrets
Never commit secrets. Use environment configuration.

## Logging
Never log passwords, access tokens, refresh tokens, secrets, or payment credentials.

## Database
Production PostgreSQL must not be publicly exposed.

## Backup
Backups must be access-controlled and restore-tested.

## Audit
Important mutations must be auditable and normal users must not edit/delete audit records.
