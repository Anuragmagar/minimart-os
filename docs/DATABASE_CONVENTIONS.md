# Database Conventions

PostgreSQL is the centralized transactional source of truth.

Primary keys:
UUID.

Timestamps:
TIMESTAMPTZ stored in UTC.

Money:
NUMERIC(14,2).

Quantities:
NUMERIC(14,3), with precision revisited if a real product requires more.

Master data:
soft deactivation preferred over deletion.

Financial/transactional records:
immutable after posting.

Inventory:
InventoryMovement is source history; InventoryBalance is a projection.

Tenant boundary:
organization_id.

Operational scope:
store_id where applicable.

Important uniqueness:
- operation_id within organization
- store code within organization
- register code within store
- sale/invoice numbers within required business scope
- product barcodes within organization

One active cash session per register should be enforced with a database constraint where supported.

Use RESTRICT for important historical references; CASCADE only where safe and intentional, such as junction records.

Avoid JSONB for core relational business entities. Use JSONB for audit metadata, provider metadata, sync metadata, and similar bounded metadata.
