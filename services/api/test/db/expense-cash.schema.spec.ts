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
  await prisma.cashMovement.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.cashSession.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.expenseCategory.deleteMany({});
  await prisma.register.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

async function createOrg(name = `Cash Test ${randomUUID()}`) {
  return prisma.organization.create({
    data: { name, legalName: `${name} Pvt Ltd`, currency: 'NPR' },
  });
}

async function createStore(orgId: string, code = `ST-${randomUUID()}`) {
  return prisma.store.create({
    data: { organizationId: orgId, name: `Store ${code}`, code },
  });
}

async function createRegister(storeId: string, code = `REG-${randomUUID()}`) {
  return prisma.register.create({
    data: { storeId, name: `Register ${code}`, code },
  });
}

async function createUser(orgId: string) {
  return prisma.user.create({
    data: {
      organizationId: orgId,
      name: `Cashier ${randomUUID()}`,
      email: `${randomUUID()}@example.com`,
      passwordHash: 'x',
    },
  });
}

async function createCashBase() {
  const org = await createOrg();
  const store = await createStore(org.id);
  const register = await createRegister(store.id);
  const cashier = await createUser(org.id);
  return { org, store, register, cashier };
}

describe('ExpenseCategory schema', () => {
  it('creates an expense category scoped to an organization', async () => {
    const org = await createOrg();
    const category = await prisma.expenseCategory.create({
      data: { organizationId: org.id, name: 'Utilities' },
    });

    expect(category.organizationId).toBe(org.id);
    expect(category.name).toBe('Utilities');
    expect(category.status).toBe('active');
  });

  it('enforces unique category names within an organization', async () => {
    const orgA = await createOrg('Org A');
    const orgB = await createOrg('Org B');
    await prisma.expenseCategory.create({
      data: { organizationId: orgA.id, name: 'Rent' },
    });
    await prisma.expenseCategory.create({
      data: { organizationId: orgB.id, name: 'Rent' },
    });

    await expect(
      prisma.expenseCategory.create({
        data: { organizationId: orgA.id, name: 'Rent' },
      }),
    ).rejects.toThrow();
  });

  it('rejects an expense category referencing a foreign organization', async () => {
    await expect(
      prisma.expenseCategory.create({
        data: { organizationId: randomUUID(), name: 'X' },
      }),
    ).rejects.toThrow();
  });
});

describe('Expense schema', () => {
  it('records an expense against a store and category', async () => {
    const { org, store } = await createCashBase();
    const category = await prisma.expenseCategory.create({
      data: { organizationId: org.id, name: 'Transport' },
    });

    const expense = await prisma.expense.create({
      data: {
        storeId: store.id,
        categoryId: category.id,
        amount: '2500.00',
        paymentMethod: 'cash',
        description: 'Kerbside delivery',
        occurredAt: new Date('2026-09-20T00:00:00.000Z'),
      },
    });

    expect(Number(expense.amount.toString())).toBe(2500);
    expect(expense.paymentMethod).toBe('cash');
    expect(expense.occurredAt.toISOString()).toBe('2026-09-20T00:00:00.000Z');
  });

  it('rejects an expense referencing a foreign store or category', async () => {
    const { org } = await createCashBase();
    const category = await prisma.expenseCategory.create({
      data: { organizationId: org.id, name: 'Misc' },
    });

    await expect(
      prisma.expense.create({
        data: {
          storeId: randomUUID(),
          categoryId: category.id,
          amount: '1',
          paymentMethod: 'cash',
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.expense.create({
        data: {
          storeId: randomUUID(),
          categoryId: randomUUID(),
          amount: '1',
          paymentMethod: 'cash',
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('protects a category and store referenced by expenses from deletion', async () => {
    const { org, store } = await createCashBase();
    const category = await prisma.expenseCategory.create({
      data: { organizationId: org.id, name: 'Salary' },
    });
    await prisma.expense.create({
      data: {
        storeId: store.id,
        categoryId: category.id,
        amount: '1',
        paymentMethod: 'cash',
        occurredAt: new Date(),
      },
    });

    await expect(
      prisma.expenseCategory.delete({ where: { id: category.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.store.delete({ where: { id: store.id } }),
    ).rejects.toThrow();
  });
});

describe('CashSession schema', () => {
  it('opens a cash session and records counts', async () => {
    const { org, store, register, cashier } = await createCashBase();

    const session = await prisma.cashSession.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        cashierId: cashier.id,
        openingAmount: '10000.00',
        expectedAmount: '40350.00',
        actualAmount: '40350.00',
        variance: '0.00',
        status: 'open',
        openedAt: new Date('2026-09-20T06:00:00.000Z'),
      },
    });

    expect(session.status).toBe('open');
    expect(Number(session.openingAmount.toString())).toBe(10000);
    expect(Number(session.variance.toString())).toBe(0);
    expect(session.closedAt).toBeNull();
  });

  it('enforces one open session per register (BR-032)', async () => {
    const { org, store, register } = await createCashBase();
    const base = {
      organizationId: org.id,
      storeId: store.id,
      registerId: register.id,
      status: 'open' as const,
      openedAt: new Date('2026-09-20T06:00:00.000Z'),
    };

    const first = await prisma.cashSession.create({ data: base });
    expect(first.status).toBe('open');

    await expect(
      prisma.cashSession.create({
        data: { ...base, openedAt: new Date('2026-09-20T07:00:00.000Z') },
      }),
    ).rejects.toThrow();

    await prisma.cashSession.update({
      where: { id: first.id },
      data: {
        status: 'closed',
        actualAmount: '12345',
        closedAt: new Date('2026-09-20T14:00:00.000Z'),
      },
    });

    const reopened = await prisma.cashSession.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        status: 'open',
        openedAt: new Date('2026-09-21T06:00:00.000Z'),
      },
    });
    expect(reopened.id).toBeTruthy();
  });

  it('rejects a cash session referencing foreign org, store, register or cashier', async () => {
    const { org, store, register } = await createCashBase();

    await expect(
      prisma.cashSession.create({
        data: {
          organizationId: org.id,
          storeId: randomUUID(),
          registerId: randomUUID(),
          cashierId: randomUUID(),
          status: 'open',
          openedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.cashSession.create({
        data: {
          organizationId: randomUUID(),
          storeId: store.id,
          registerId: register.id,
          status: 'open',
          openedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('links sales to their cash session (ASM-020 closed)', async () => {
    const { org, store, register, cashier } = await createCashBase();
    const session = await prisma.cashSession.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        cashierId: cashier.id,
        status: 'open',
        openedAt: new Date(),
      },
    });

    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        cashSessionId: session.id,
        saleNumber: 'S-C1',
        status: 'paid',
        operationId: randomUUID(),
      },
    });

    expect(sale.cashSessionId).toBe(session.id);
    await expect(
      prisma.sale.create({
        data: {
          organizationId: org.id,
          storeId: store.id,
          registerId: register.id,
          cashSessionId: randomUUID(),
          saleNumber: 'S-C2',
          status: 'paid',
          operationId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('CashMovement schema', () => {
  it('records cash movements against a session', async () => {
    const { org, store, register } = await createCashBase();
    const session = await prisma.cashSession.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        status: 'open',
        openedAt: new Date('2026-09-20T06:00:00.000Z'),
      },
    });

    const movement = await prisma.cashMovement.create({
      data: {
        cashSessionId: session.id,
        type: 'cash_in',
        amount: '5000.00',
        reference: 'IN-001',
        occurredAt: new Date('2026-09-20T10:00:00.000Z'),
      },
    });

    expect(movement.type).toBe('cash_in');
    expect(movement.reference).toBe('IN-001');
    expect(Number(movement.amount.toString())).toBe(5000);
  });

  it('rejects a movement referencing a foreign session and protects the session', async () => {
    const { org, store, register } = await createCashBase();
    const session = await prisma.cashSession.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        status: 'open',
        openedAt: new Date(),
      },
    });
    await prisma.cashMovement.create({
      data: {
        cashSessionId: session.id,
        type: 'cash_out',
        amount: '100',
        occurredAt: new Date(),
      },
    });

    await expect(
      prisma.cashMovement.create({
        data: {
          cashSessionId: randomUUID(),
          type: 'cash_in',
          amount: '1',
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.cashSession.delete({ where: { id: session.id } }),
    ).rejects.toThrow();
  });
});

describe('Expense/cash schema structure', () => {
  it('enforces expected foreign-key deletion actions', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT cl.relname AS table_name, a.attname AS column_name, c.confdeltype::text AS on_delete
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
         ON k.attnum = ANY(c.conkey)
       JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
       WHERE c.contype = 'f'
         AND cl.relname IN ('cash_movements', 'cash_sessions', 'expenses', 'expense_categories')
       ORDER BY cl.relname, a.attname`,
    )) as Array<{ table_name: string; column_name: string; on_delete: string }>;

    expect(rows).toEqual([
      {
        table_name: 'cash_movements',
        column_name: 'cash_session_id',
        on_delete: 'r',
      },
      {
        table_name: 'cash_sessions',
        column_name: 'cashier_id',
        on_delete: 'r',
      },
      {
        table_name: 'cash_sessions',
        column_name: 'organization_id',
        on_delete: 'r',
      },
      {
        table_name: 'cash_sessions',
        column_name: 'register_id',
        on_delete: 'r',
      },
      { table_name: 'cash_sessions', column_name: 'store_id', on_delete: 'r' },
      {
        table_name: 'expense_categories',
        column_name: 'organization_id',
        on_delete: 'r',
      },
      { table_name: 'expenses', column_name: 'category_id', on_delete: 'r' },
      { table_name: 'expenses', column_name: 'store_id', on_delete: 'r' },
    ]);
  });

  it('declares NUMERIC columns with the documented scales', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE data_type = 'numeric'
         AND table_schema = 'public'
         AND table_name IN ('cash_movements', 'cash_sessions', 'expenses')
       ORDER BY table_name, column_name`,
    )) as Array<{
      table_name: string;
      column_name: string;
      numeric_precision: number;
      numeric_scale: number;
    }>;

    expect(rows).toEqual([
      {
        table_name: 'cash_movements',
        column_name: 'amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'cash_sessions',
        column_name: 'actual_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'cash_sessions',
        column_name: 'expected_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'cash_sessions',
        column_name: 'opening_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'cash_sessions',
        column_name: 'variance',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'expenses',
        column_name: 'amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
    ]);
  });

  it('defines the expected indexes on expense/cash tables including the open-session guard', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('cash_movements', 'cash_sessions', 'expenses', 'expense_categories')
       ORDER BY indexname`,
    )) as Array<{ indexname: string }>;

    expect(rows).toEqual([
      { indexname: 'cash_movements_cash_session_id_occurred_at_idx' },
      { indexname: 'cash_movements_pkey' },
      { indexname: 'cash_sessions_pkey' },
      { indexname: 'cash_sessions_register_id_opened_at_idx' },
      { indexname: 'cash_sessions_register_open_key' },
      { indexname: 'cash_sessions_store_id_opened_at_idx' },
      { indexname: 'expense_categories_organization_id_name_key' },
      { indexname: 'expense_categories_pkey' },
      { indexname: 'expenses_category_id_idx' },
      { indexname: 'expenses_pkey' },
      { indexname: 'expenses_store_id_occurred_at_idx' },
    ]);
  });

  it('guards against more than one open session per register with a partial unique index', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'cash_sessions_register_open_key'`,
    )) as Array<{ indexname: string; indexdef: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain("WHERE (status = 'open'::text)");
  });

  it('types session status and movement type as text and timestamps as timestamptz', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, is_nullable, data_type, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
           (table_name = 'cash_sessions' AND column_name IN ('status', 'closed_at'))
           OR (table_name = 'cash_movements' AND column_name = 'type')
           OR (table_name = 'expenses' AND column_name = 'occurred_at')
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
        table_name: 'cash_movements',
        column_name: 'type',
        is_nullable: 'NO',
        data_type: 'text',
        column_default: null,
      },
      {
        table_name: 'cash_sessions',
        column_name: 'closed_at',
        is_nullable: 'YES',
        data_type: 'timestamp with time zone',
        column_default: null,
      },
      {
        table_name: 'cash_sessions',
        column_name: 'status',
        is_nullable: 'NO',
        data_type: 'text',
        column_default: null,
      },
      {
        table_name: 'expenses',
        column_name: 'occurred_at',
        is_nullable: 'NO',
        data_type: 'timestamp with time zone',
        column_default: null,
      },
    ]);
  });

  it('defines ExpenseCategoryStatus with exactly active and inactive labels', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       WHERE t.typname = 'ExpenseCategoryStatus'
       ORDER BY e.enumsortorder`,
    )) as Array<{ typname: string; enumlabel: string }>;

    expect(rows).toEqual([
      { typname: 'ExpenseCategoryStatus', enumlabel: 'active' },
      { typname: 'ExpenseCategoryStatus', enumlabel: 'inactive' },
    ]);
  });
});
