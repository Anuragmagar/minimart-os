import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

describe('Organization schema', () => {
  it('creates an organization with documented defaults', async () => {
    const org = await prisma.organization.create({
      data: {
        name: 'Kathmandu Mart',
        legalName: 'Kathmandu Mart Pvt Ltd',
        currency: 'NPR',
      },
    });

    expect(org.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(org.name).toBe('Kathmandu Mart');
    expect(org.legalName).toBe('Kathmandu Mart Pvt Ltd');
    expect(org.currency).toBe('NPR');
    expect(org.timezone).toBe('Asia/Kathmandu');
    expect(org.status).toBe('active');
    expect(org.createdAt).toBeInstanceOf(Date);
    expect(org.updatedAt).toBeInstanceOf(Date);
  });

  it('touches updated_at on update', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Before', legalName: 'Before Pvt Ltd', currency: 'NPR' },
    });
    const original = org.updatedAt.getTime();

    await new Promise((resolve) => setTimeout(resolve, 5));
    const renamed = await prisma.organization.update({
      where: { id: org.id },
      data: { name: 'After' },
    });

    expect(renamed.name).toBe('After');
    expect(renamed.updatedAt.getTime()).toBeGreaterThan(original);
  });

  it('rejects an unknown status value at the database level', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "organizations" ("id", "name", "legal_name", "currency", "status") VALUES (gen_random_uuid(), 'X', 'X', 'NPR', 'deleted')`,
      ),
    ).rejects.toThrow();
  });

  it('requires currency at the database level', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "organizations" ("id", "name", "legal_name") VALUES (gen_random_uuid(), 'X', 'X')`,
      ),
    ).rejects.toThrow();
  });

  it('exposes the documented columns with correct types', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'organizations'
       ORDER BY ordinal_position`,
    )) as Array<{
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }>;

    const byName = new Map(rows.map((row) => [row.column_name, row]));

    expect(byName.get('id')).toMatchObject({
      data_type: 'uuid',
      is_nullable: 'NO',
    });
    expect(byName.get('name')).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
    });
    expect(byName.get('legal_name')).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
    });
    expect(byName.get('pan_number')).toMatchObject({
      data_type: 'text',
      is_nullable: 'YES',
    });
    expect(byName.get('vat_number')).toMatchObject({
      data_type: 'text',
      is_nullable: 'YES',
    });
    expect(byName.get('contact')).toMatchObject({
      data_type: 'text',
      is_nullable: 'YES',
    });
    expect(byName.get('address')).toMatchObject({
      data_type: 'text',
      is_nullable: 'YES',
    });
    expect(byName.get('currency')).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
    });
    expect(byName.get('timezone')).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
      column_default: "'Asia/Kathmandu'::text",
    });
    expect(byName.get('status')).toMatchObject({
      data_type: 'USER-DEFINED',
      udt_name: 'OrganizationStatus',
      is_nullable: 'NO',
      column_default: '\'active\'::"OrganizationStatus"',
    });
    expect(byName.get('created_at')).toMatchObject({
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
    });
    expect(byName.get('updated_at')).toMatchObject({
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
    });
  });

  it('defines status as a two-value enum', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       WHERE t.typname = 'OrganizationStatus'
       ORDER BY e.enumsortorder`,
    )) as Array<{ enumlabel: string }>;

    expect(rows.map((r) => r.enumlabel)).toEqual(['active', 'inactive']);
  });

  it('declares a primary key on id', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT a.attname
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = ANY(c.conkey)
       WHERE cl.relname = 'organizations' AND c.contype = 'p'`,
    )) as Array<{ attname: string }>;

    expect(rows.map((r) => r.attname)).toEqual(['id']);
  });
});
