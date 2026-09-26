import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient as PrismaClientType } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { provisionTestDatabase } from './db-test-db.helper.js';
import {
  DEV_SEED_ORG_ID,
  DEV_SEED_STORE_ID,
  runSeed,
} from '../../prisma/seed.js';

const serviceRoot = path.resolve(fileURLToPath(import.meta.url), '../../..');
const prismaCliEntry = path.join(
  serviceRoot,
  'node_modules',
  'prisma',
  'build',
  'index.js',
);
const schemaFile = readFileSync(
  path.join(serviceRoot, 'prisma', 'schema.prisma'),
  'utf8',
);

function tableNames(): string[] {
  const found: string[] = [];
  const blockRe = /^model\s+(\w+)\s*\{(?:[^}]*?)\n\}/gm;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(schemaFile)) !== null) {
    const map = /@@map\("([^"]+)"\)/g.exec(block[0]);
    if (map) {
      found.push(map[1]);
    } else {
      found.push(block[1].toLowerCase());
    }
  }
  return found;
}

function enumNames(): string[] {
  const found: string[] = [];
  const re = /^enum\s+(\w+)\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schemaFile)) !== null) {
    found.push(m[1]);
  }
  return found;
}

function migrationFolders(): string[] {
  return readdirSync(path.join(serviceRoot, 'prisma', 'migrations'))
    .filter((name) => !name.startsWith('.'))
    .filter((name) =>
      statSync(
        path.join(serviceRoot, 'prisma', 'migrations', name),
      ).isDirectory(),
    )
    .sort();
}

function runPrisma(
  testUrl: string,
  args: string[],
): {
  status: number;
  stdout: string;
  stderr: string;
} {
  try {
    const stdout = execFileSync(process.execPath, [prismaCliEntry, ...args], {
      cwd: serviceRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: testUrl },
    }) as string;
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      status: e.status ?? 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    };
  }
}

let prisma: PrismaClientType;
let testUrl: string;

beforeAll(async () => {
  testUrl = await provisionTestDatabase();
  const adapter = new PrismaPg({ connectionString: testUrl });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.userStoreAccess.deleteMany({});
  await prisma.userRole.deleteMany({});
  await prisma.rolePermission.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.productBarcode.deleteMany({});
  await prisma.productPrice.deleteMany({});
  await prisma.productBatch.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.unitConversion.deleteMany({});
  await prisma.unit.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.taxCategory.deleteMany({});
  await prisma.expenseCategory.deleteMany({});
  await prisma.inventoryLocation.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.register.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.permission.deleteMany({});
  await prisma.$disconnect();
});

describe('Migration chain applied to a clean database', () => {
  it('reproduces every Prisma model as a public table and nothing else', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`,
    )) as { name: string }[];

    const expected = [...tableNames(), '_prisma_migrations'].sort();
    expect(rows.map((r) => r.name).sort()).toEqual(expected);
  });

  it('reproduces every Prisma enum as a PostgreSQL type and nothing else', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT t.typname AS name
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype = 'e'
       ORDER BY t.typname`,
    )) as { name: string }[];

    expect(rows.map((r) => r.name).sort()).toEqual(enumNames().sort());
  });

  it('records every migration folder as applied, in folder order', async () => {
    const folders = migrationFolders();
    const applied = (await prisma.$queryRawUnsafe(
      `SELECT migration_name AS name, finished_at
       FROM "_prisma_migrations"
       ORDER BY migration_name`,
    )) as { name: string; finished_at: Date | null }[];

    expect(applied.map((r) => r.name)).toEqual(folders);
    expect(applied.every((r) => r.finished_at !== null)).toBe(true);
  });

  it('re-running migrate deploy on a fully migrated database is a no-op', () => {
    const result = runPrisma(testUrl, ['migrate', 'deploy']);
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
  });
});

describe('Migration chain on a representative (seeded) database', () => {
  it('applies cleanly on top of the reference master-data seed', async () => {
    await runSeed(prisma);

    const seed = prisma.organization.findUnique({
      where: { id: DEV_SEED_ORG_ID },
    });
    const store = prisma.store.findUnique({
      where: {
        organizationId_code: {
          organizationId: DEV_SEED_ORG_ID,
          code: 'KTM-01',
        },
      },
    });
    const [
      registers,
      users,
      roles,
      products,
      prices,
      batches,
      suppliers,
      customers,
      expenseCategories,
    ] = await Promise.all([
      prisma.register.count({ where: { storeId: (await store)?.id } }),
      prisma.user.count({ where: { organizationId: DEV_SEED_ORG_ID } }),
      prisma.role.count({ where: { organizationId: DEV_SEED_ORG_ID } }),
      prisma.product.count({ where: { organizationId: DEV_SEED_ORG_ID } }),
      prisma.productPrice.count({
        where: { product: { organizationId: DEV_SEED_ORG_ID } },
      }),
      prisma.productBatch.count({
        where: { product: { organizationId: DEV_SEED_ORG_ID } },
      }),
      prisma.supplier.count({ where: { organizationId: DEV_SEED_ORG_ID } }),
      prisma.customer.count({ where: { organizationId: DEV_SEED_ORG_ID } }),
      prisma.expenseCategory.count({
        where: { organizationId: DEV_SEED_ORG_ID },
      }),
    ]);

    expect((await seed)?.id).toBe(DEV_SEED_ORG_ID);
    expect((await store)?.id).toBe(DEV_SEED_STORE_ID);
    expect(registers).toBe(2);
    expect(users).toBe(3);
    expect(roles).toBe(3);
    expect(products).toBe(12);
    expect(prices).toBe(12);
    expect(batches).toBe(12);
    expect(suppliers).toBe(3);
    expect(customers).toBe(3);
    expect(expenseCategories).toBe(6);
  });

  it('re-running migrate deploy preserves seed data', async () => {
    const result = runPrisma(testUrl, ['migrate', 'deploy']);
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout);
    }

    const products = await prisma.product.count({
      where: { organizationId: DEV_SEED_ORG_ID },
    });
    const batches = await prisma.productBatch.count({
      where: { product: { organizationId: DEV_SEED_ORG_ID } },
    });
    const users = await prisma.user.count({
      where: { organizationId: DEV_SEED_ORG_ID },
    });
    expect(products).toBe(12);
    expect(batches).toBe(12);
    expect(users).toBe(3);
  }, 120000);

  it('produces zero schema drift: deployed database equals schema.prisma', () => {
    const result = runPrisma(testUrl, [
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      path.join('prisma', 'schema.prisma'),
      '--exit-code',
      '--script',
    ]);
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
    expect(result.stdout.trim()).toMatch(/^-- This is an empty migration\.$/);
  }, 120000);
});
