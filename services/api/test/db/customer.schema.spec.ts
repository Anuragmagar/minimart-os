import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient as PrismaClientType } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaClientType;

beforeAll(async () => {
  const url = await provisionTestDatabase();
  const adapter = new PrismaPg({ connectionString: url });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.customerPayment.deleteMany({});
  await prisma.customerLedgerEntry.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

async function createOrg(name = `Cust Test ${randomUUID()}`) {
  return prisma.organization.create({
    data: { name, legalName: `${name} Pvt Ltd`, currency: 'NPR' },
  });
}

async function createCustomer(
  orgId: string,
  code = `CUST-${randomUUID()}`,
  name = `Customer ${code}`,
) {
  return prisma.customer.create({
    data: { organizationId: orgId, name, code },
  });
}

describe('Customer schema', () => {
  it('creates a customer scoped to an organization with defaults', async () => {
    const org = await createOrg();
    const customer = await prisma.customer.create({
      data: {
        organizationId: org.id,
        name: 'Shyam Khadka',
        code: 'SHYAM',
        phone: '9811111111',
        address: 'Maharajgunj, Kathmandu',
        creditLimit: '15000.00',
      },
    });

    expect(customer.organizationId).toBe(org.id);
    expect(customer.phone).toBe('9811111111');
    expect(Number(customer.creditLimit?.toString())).toBe(15000);
    expect(customer.status).toBe('active');
  });

  it('enforces unique customer codes within an organization', async () => {
    const orgA = await createOrg('Org A');
    const orgB = await createOrg('Org B');
    await prisma.customer.create({
      data: { organizationId: orgA.id, name: 'A', code: 'CUST1' },
    });
    const inB = await prisma.customer.create({
      data: { organizationId: orgB.id, name: 'B', code: 'CUST1' },
    });

    expect(inB.organizationId).toBe(orgB.id);
    await expect(
      prisma.customer.create({
        data: { organizationId: orgA.id, name: 'A2', code: 'CUST1' },
      }),
    ).rejects.toThrow();
  });

  it('rejects a customer referencing a foreign organization', async () => {
    await expect(
      prisma.customer.create({
        data: { organizationId: randomUUID(), name: 'X', code: 'X' },
      }),
    ).rejects.toThrow();
  });
});

describe('Customer ledger and payment schema', () => {
  it('records chronological ledger entries with debit/credit direction', async () => {
    const org = await createOrg();
    const customer = await createCustomer(org.id);

    await prisma.customerLedgerEntry.create({
      data: {
        customerId: customer.id,
        entryType: 'debit',
        amount: '8000.00',
        balanceAfter: '8000.00',
        referenceType: 'sale',
        occurredAt: new Date('2026-09-14T06:00:00.000Z'),
      },
    });
    await prisma.customerLedgerEntry.create({
      data: {
        customerId: customer.id,
        entryType: 'credit',
        amount: '3000.00',
        balanceAfter: '5000.00',
        referenceType: 'customer_payment',
        occurredAt: new Date('2026-09-15T06:00:00.000Z'),
      },
    });

    const entries = await prisma.customerLedgerEntry.findMany({
      where: { customerId: customer.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(entries).toHaveLength(2);
    expect(entries[0].entryType).toBe('debit');
    expect(entries[0].referenceType).toBe('sale');
    expect(Number(entries[0].balanceAfter.toString())).toBe(8000);
    expect(Number(entries[1].balanceAfter.toString())).toBe(5000);
  });

  it('records a customer payment with method and reference', async () => {
    const org = await createOrg();
    const customer = await createCustomer(org.id);

    const payment = await prisma.customerPayment.create({
      data: {
        customerId: customer.id,
        paymentMethod: 'cash',
        amount: '3000.00',
        reference: 'PAY-C5',
        paidAt: new Date('2026-09-15T00:00:00.000Z'),
      },
    });

    expect(payment.paymentMethod).toBe('cash');
    expect(payment.reference).toBe('PAY-C5');
    expect(Number(payment.amount.toString())).toBe(3000);
    expect(payment.paidAt.toISOString()).toBe('2026-09-15T00:00:00.000Z');
  });

  it('prevents deleting a customer with financial history', async () => {
    const org = await createOrg();
    const customer = await createCustomer(org.id);
    await prisma.customerLedgerEntry.create({
      data: {
        customerId: customer.id,
        entryType: 'debit',
        amount: '10',
        balanceAfter: '10',
        occurredAt: new Date(),
      },
    });

    await expect(
      prisma.customer.delete({ where: { id: customer.id } }),
    ).rejects.toThrow();
  });

  it('rejects ledger and payment rows referencing a foreign customer', async () => {
    const org = await createOrg();
    await createCustomer(org.id);

    await expect(
      prisma.customerLedgerEntry.create({
        data: {
          customerId: randomUUID(),
          entryType: 'debit',
          amount: '1',
          balanceAfter: '1',
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.customerPayment.create({
        data: {
          customerId: randomUUID(),
          paymentMethod: 'cash',
          amount: '1',
          paidAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('Customer schema structure', () => {
  it('enforces expected foreign-key deletion actions', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT cl.relname AS table_name, a.attname AS column_name, c.confdeltype::text AS on_delete
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
         ON k.attnum = ANY(c.conkey)
       JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
       WHERE c.contype = 'f'
         AND cl.relname IN ('customers', 'customer_ledger_entries', 'customer_payments')
       ORDER BY cl.relname, a.attname`,
    )) as Array<{ table_name: string; column_name: string; on_delete: string }>;

    expect(rows).toEqual([
      {
        table_name: 'customer_ledger_entries',
        column_name: 'customer_id',
        on_delete: 'r',
      },
      {
        table_name: 'customer_payments',
        column_name: 'customer_id',
        on_delete: 'r',
      },
      {
        table_name: 'customers',
        column_name: 'organization_id',
        on_delete: 'r',
      },
    ]);
  });

  it('declares NUMERIC columns with the documented scales', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE data_type = 'numeric'
         AND table_schema = 'public'
         AND table_name IN ('customers', 'customer_ledger_entries', 'customer_payments')
       ORDER BY table_name, column_name`,
    )) as Array<{
      table_name: string;
      column_name: string;
      numeric_precision: number;
      numeric_scale: number;
    }>;

    expect(rows).toEqual([
      {
        table_name: 'customer_ledger_entries',
        column_name: 'amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'customer_ledger_entries',
        column_name: 'balance_after',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'customer_payments',
        column_name: 'amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'customers',
        column_name: 'credit_limit',
        numeric_precision: 14,
        numeric_scale: 2,
      },
    ]);
  });

  it('defines the expected indexes on customer tables', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('customers', 'customer_ledger_entries', 'customer_payments')
       ORDER BY indexname`,
    )) as Array<{ indexname: string }>;

    expect(rows).toEqual([
      { indexname: 'customer_ledger_entries_customer_id_occurred_at_idx' },
      { indexname: 'customer_ledger_entries_pkey' },
      { indexname: 'customer_payments_customer_id_paid_at_idx' },
      { indexname: 'customer_payments_pkey' },
      { indexname: 'customers_organization_id_code_key' },
      { indexname: 'customers_organization_id_name_idx' },
      { indexname: 'customers_pkey' },
    ]);
  });

  it('types ledger entry_type and payment_method as text', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, is_nullable, data_type, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
           (table_name = 'customer_ledger_entries' AND column_name IN ('entry_type', 'balance_after', 'reference_id'))
           OR (table_name = 'customer_payments' AND column_name IN ('payment_method', 'reference'))
         )
       ORDER BY table_name, column_name`,
    )) as Array<{
      table_name: string;
      column_name: string;
      is_nullable: string;
      data_type: string;
      column_default: string | null;
    }>;

    expect(rows).toEqual([
      {
        table_name: 'customer_ledger_entries',
        column_name: 'balance_after',
        is_nullable: 'NO',
        data_type: 'numeric',
        column_default: null,
      },
      {
        table_name: 'customer_ledger_entries',
        column_name: 'entry_type',
        is_nullable: 'NO',
        data_type: 'text',
        column_default: null,
      },
      {
        table_name: 'customer_ledger_entries',
        column_name: 'reference_id',
        is_nullable: 'YES',
        data_type: 'uuid',
        column_default: null,
      },
      {
        table_name: 'customer_payments',
        column_name: 'payment_method',
        is_nullable: 'NO',
        data_type: 'text',
        column_default: null,
      },
      {
        table_name: 'customer_payments',
        column_name: 'reference',
        is_nullable: 'YES',
        data_type: 'text',
        column_default: null,
      },
    ]);
  });

  it('defines CustomerStatus with exactly active and inactive labels', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       WHERE t.typname = 'CustomerStatus'
       ORDER BY e.enumsortorder`,
    )) as Array<{ typname: string; enumlabel: string }>;

    expect(rows).toEqual([
      { typname: 'CustomerStatus', enumlabel: 'active' },
      { typname: 'CustomerStatus', enumlabel: 'inactive' },
    ]);
  });
});
