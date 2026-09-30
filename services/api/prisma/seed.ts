import { pathToFileURL } from 'node:url';
import 'dotenv/config';
import { hash as argon2Hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient as PrismaClientType } from '../src/generated/prisma/client.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { appConfigValidationSchema } from '../src/config/configuration.js';
import { PERMISSION_CODES } from '../src/auth/permission-codes.js';

export const DEV_SEED_VERSION = '01';
export const DEV_SEED_ORG_ID = '10000000-0000-4000-8000-000000000001';
export const DEV_SEED_STORE_ID = '10000000-0000-4000-8000-000000000002';
export const DEV_SEED_PASSWORD = 'MinimartDev@123';

const ARGON2ID_ALGORITHM = 2;

/**
 * Seeded password hashes must use the same encoding as PasswordService (Argon2id),
 * otherwise login fails with an Argon2 "Decoding failed" error at runtime.
 */
async function devPasswordHash(): Promise<string> {
  const env = appConfigValidationSchema.parse(process.env);
  return argon2Hash(DEV_SEED_PASSWORD, {
    algorithm: ARGON2ID_ALGORITHM,
    memoryCost: env.ARGON2_MEMORY_COST,
    timeCost: env.ARGON2_TIME_COST,
    parallelism: env.ARGON2_PARALLELISM,
  });
}

export const DEV_PERMISSION_CODES: readonly string[] = PERMISSION_CODES;

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: DEV_PERMISSION_CODES,
  manager: [
    'products:manage',
    'products:create',
    'products:update',
    'products:deactivate',
    'sales:return',
    'sales:void',
    'inventory:view',
    'inventory:adjust',
    'inventory:transfer',
    'purchasing:create',
    'purchasing:receive',
    'customers:view',
    'customers:credit',
    'reports:sales',
    'reports:profit',
    'cash:open',
    'cash:close',
    'cash:withdraw',
  ],
  cashier: [
    'sales:create',
    'sales:return',
    'inventory:view',
    'customers:view',
    'cash:open',
    'cash:close',
    'cash:withdraw',
    'reports:sales',
  ],
};

const CATEGORIES = [
  'Beverages',
  'Snacks',
  'Dairy & Eggs',
  'Cooking Essentials',
  'Personal Care',
  'Stationery',
];

const BRANDS = [
  'Everest Foods',
  'Himalaya Dairy',
  'Kathmandu Snacks',
  'Nepal Organics',
  'City Fresh',
];

const UNITS = [
  { name: 'Piece', code: 'PCS', precision: 0 },
  { name: 'Kilogram', code: 'KG', precision: 3 },
  { name: 'Litre', code: 'LTR', precision: 2 },
  { name: 'Dozen', code: 'DOZ', precision: 0 },
  { name: 'Packet', code: 'PKT', precision: 0 },
  { name: 'Box', code: 'BOX', precision: 0 },
];

const UNIT_CONVERSIONS = [
  { fromCode: 'DOZ', toCode: 'PCS', multiplier: '12.000000' },
  { fromCode: 'BOX', toCode: 'PCS', multiplier: '10.000000' },
];

const SUPPLIERS = [
  {
    code: 'SNP-001',
    name: 'Himalaya Wholesalers',
    contact: '9800000001',
    paymentTerms: 'net-30',
    creditLimit: '500000.00',
  },
  {
    code: 'SNP-002',
    name: 'Kathmandu Distributors',
    contact: '9800000002',
    paymentTerms: 'net-15',
    creditLimit: '250000.00',
  },
  {
    code: 'SNP-003',
    name: 'Fresh Valley Supplies',
    contact: '9800000003',
    paymentTerms: 'cash',
    creditLimit: '100000.00',
  },
];

const CUSTOMERS = [
  {
    code: 'CUS-001',
    name: 'Ram Shrestha',
    phone: '9800000011',
    address: 'Thamel, Kathmandu',
    creditLimit: '25000.00',
  },
  {
    code: 'CUS-002',
    name: 'Sita Gurung',
    phone: '9800000012',
    address: 'New Road, Kathmandu',
    creditLimit: null,
  },
  {
    code: 'CUS-003',
    name: 'Binod Karki',
    phone: '9800000013',
    address: 'Baneshwor, Kathmandu',
    creditLimit: null,
  },
];

const EXPENSE_CATEGORIES = [
  'Rent',
  'Utilities',
  'Salaries & Wages',
  'Store Supplies',
  'Marketing',
  'Miscellaneous',
];

const PRODUCTS = [
  {
    sku: 'WTR-001',
    name: 'Mineral Water 1L',
    category: 'Beverages',
    brand: 'City Fresh',
    unit: 'PCS',
    barcode: '8905000000011',
    purchase: '22.00',
    retail: '35.00',
    reorderLevel: '24.000',
    reorderQuantity: '48.000',
    batchExpiryMonths: 12,
  },
  {
    sku: 'JUI-001',
    name: 'Mango Juice 1L',
    category: 'Beverages',
    brand: 'Nepal Organics',
    unit: 'PCS',
    barcode: '8905000000028',
    purchase: '95.00',
    retail: '140.00',
    reorderLevel: '12.000',
    reorderQuantity: '24.000',
    batchExpiryMonths: 9,
  },
  {
    sku: 'BSC-001',
    name: 'Biscuit Pack 400g',
    category: 'Snacks',
    brand: 'Kathmandu Snacks',
    unit: 'PKT',
    barcode: '8905000000035',
    purchase: '60.00',
    retail: '90.00',
    reorderLevel: '24.000',
    reorderQuantity: '48.000',
    batchExpiryMonths: 10,
  },
  {
    sku: 'NDL-001',
    name: 'Instant Noodles 75g',
    category: 'Snacks',
    brand: 'Kathmandu Snacks',
    unit: 'PKT',
    barcode: '8905000000042',
    purchase: '18.00',
    retail: '25.00',
    reorderLevel: '48.000',
    reorderQuantity: '96.000',
    batchExpiryMonths: 6,
  },
  {
    sku: 'OIL-001',
    name: 'Cooking Oil 1L',
    category: 'Cooking Essentials',
    brand: 'Everest Foods',
    unit: 'LTR',
    barcode: '8905000000059',
    purchase: '210.00',
    retail: '250.00',
    reorderLevel: '12.000',
    reorderQuantity: '24.000',
    batchExpiryMonths: 6,
  },
  {
    sku: 'RIC-001',
    name: 'Basmati Rice 1kg',
    category: 'Cooking Essentials',
    brand: 'Nepal Organics',
    unit: 'KG',
    barcode: '8905000000066',
    purchase: '140.00',
    retail: '170.00',
    reorderLevel: '20.000',
    reorderQuantity: '40.000',
    batchExpiryMonths: 18,
  },
  {
    sku: 'DAL-001',
    name: 'Lentils 500g',
    category: 'Cooking Essentials',
    brand: 'Everest Foods',
    unit: 'PKT',
    barcode: '8905000000073',
    purchase: '90.00',
    retail: '115.00',
    reorderLevel: '20.000',
    reorderQuantity: '40.000',
    batchExpiryMonths: 12,
  },
  {
    sku: 'MLK-001',
    name: 'Whole Milk 1L',
    category: 'Dairy & Eggs',
    brand: 'Himalaya Dairy',
    unit: 'LTR',
    barcode: '8905000000080',
    purchase: '78.00',
    retail: '95.00',
    reorderLevel: '12.000',
    reorderQuantity: '24.000',
    batchExpiryMonths: 3,
  },
  {
    sku: 'EGG-001',
    name: 'Fresh Eggs (12)',
    category: 'Dairy & Eggs',
    brand: 'Himalaya Dairy',
    unit: 'DOZ',
    barcode: '8905000000097',
    purchase: '110.00',
    retail: '130.00',
    reorderLevel: '10.000',
    reorderQuantity: '20.000',
    batchExpiryMonths: 3,
  },
  {
    sku: 'TPT-001',
    name: 'Toothpaste 100g',
    category: 'Personal Care',
    brand: 'City Fresh',
    unit: 'PCS',
    barcode: '8905000000103',
    purchase: '120.00',
    retail: '150.00',
    reorderLevel: '12.000',
    reorderQuantity: '24.000',
    batchExpiryMonths: 24,
  },
  {
    sku: 'SOP-001',
    name: 'Bathing Soap 75g',
    category: 'Personal Care',
    brand: 'City Fresh',
    unit: 'PCS',
    barcode: '8905000000110',
    purchase: '55.00',
    retail: '70.00',
    reorderLevel: '24.000',
    reorderQuantity: '48.000',
    batchExpiryMonths: 24,
  },
  {
    sku: 'NTB-001',
    name: 'Notebook A5',
    category: 'Stationery',
    brand: null,
    unit: 'PCS',
    barcode: '8905000000127',
    purchase: '40.00',
    retail: '55.00',
    reorderLevel: '20.000',
    reorderQuantity: '40.000',
    batchExpiryMonths: 36,
  },
];

type SeedContext = {
  id: string;
};

export async function runSeed(db: PrismaClientType) {
  const passwordHash = await devPasswordHash();
  const now = new Date();

  const org = await db.organization.upsert({
    where: { id: DEV_SEED_ORG_ID },
    update: {
      name: 'Minimart Demo',
      legalName: 'Minimart Demo Pvt Ltd',
      currency: 'NPR',
    },
    create: {
      id: DEV_SEED_ORG_ID,
      name: 'Minimart Demo',
      legalName: 'Minimart Demo Pvt Ltd',
      currency: 'NPR',
    },
  });

  const store = await db.store.upsert({
    where: {
      organizationId_code: { organizationId: org.id, code: 'KTM-01' },
    },
    update: { name: 'Kathmandu Store', address: 'New Road, Kathmandu' },
    create: {
      organizationId: org.id,
      id: DEV_SEED_STORE_ID,
      name: 'Kathmandu Store',
      code: 'KTM-01',
      address: 'New Road, Kathmandu',
      phone: '01123456789',
    },
  });

  const registerDefs = [
    {
      id: '10000000-0000-4000-8000-000000000003',
      code: 'REG-01',
      name: 'Front Counter',
    },
    {
      id: '10000000-0000-4000-8000-000000000004',
      code: 'REG-02',
      name: 'Back Office',
    },
  ];
  for (const def of registerDefs) {
    await db.register.upsert({
      where: { storeId_code: { storeId: store.id, code: def.code } },
      update: { name: def.name },
      create: { id: def.id, storeId: store.id, name: def.name, code: def.code },
    });
  }

  const userDefs = [
    { email: 'admin@minimart.local', name: 'Admin Demo' },
    { email: 'manager@minimart.local', name: 'Manager Demo' },
    { email: 'cashier@minimart.local', name: 'Cashier Demo' },
  ];
  for (const def of userDefs) {
    await db.user.upsert({
      where: { email: def.email },
      update: { name: def.name, passwordHash },
      create: {
        organizationId: org.id,
        name: def.name,
        email: def.email,
        passwordHash,
      },
    });
  }

  const roleDefs = [
    {
      code: 'owner',
      name: 'Owner',
      description: 'Full access to the organization',
    },
    {
      code: 'manager',
      name: 'Manager',
      description: 'Operational management without user administration',
    },
    {
      code: 'cashier',
      name: 'Cashier',
      description: 'POS operations at the register',
    },
  ];
  const roles: Record<string, SeedContext> = {};
  for (const def of roleDefs) {
    const role = await db.role.upsert({
      where: {
        organizationId_code: { organizationId: org.id, code: def.code },
      },
      update: { name: def.name, description: def.description },
      create: {
        organizationId: org.id,
        name: def.name,
        code: def.code,
        description: def.description,
      },
    });
    roles[def.code] = role;
  }

  const permissions: Record<string, SeedContext> = {};
  for (const code of DEV_PERMISSION_CODES) {
    const permission = await db.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    });
    permissions[code] = permission;
  }

  for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
    for (const code of codes) {
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: roles[roleCode].id,
            permissionId: permissions[code].id,
          },
        },
        update: {},
        create: {
          roleId: roles[roleCode].id,
          permissionId: permissions[code].id,
        },
      });
    }
  }

  const userRoles: Record<string, string> = {
    'admin@minimart.local': 'owner',
    'manager@minimart.local': 'manager',
    'cashier@minimart.local': 'cashier',
  };
  for (const [email, roleCode] of Object.entries(userRoles)) {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error(`seeded user ${email} missing`);
    }
    await db.userRole.upsert({
      where: {
        userId_roleId: { userId: user.id, roleId: roles[roleCode].id },
      },
      update: {},
      create: { userId: user.id, roleId: roles[roleCode].id },
    });
    await db.userStoreAccess.upsert({
      where: { userId_storeId: { userId: user.id, storeId: store.id } },
      update: {},
      create: { userId: user.id, storeId: store.id },
    });
  }

  for (const name of CATEGORIES) {
    await db.category.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { organizationId: org.id, name },
    });
  }
  for (const name of BRANDS) {
    await db.brand.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { organizationId: org.id, name },
    });
  }

  const units: Record<string, SeedContext> = {};
  for (const def of UNITS) {
    const unit = await db.unit.upsert({
      where: {
        organizationId_code: { organizationId: org.id, code: def.code },
      },
      update: { name: def.name, precision: def.precision },
      create: {
        organizationId: org.id,
        name: def.name,
        code: def.code,
        precision: def.precision,
      },
    });
    units[def.code] = unit;
  }
  for (const def of UNIT_CONVERSIONS) {
    await db.unitConversion.upsert({
      where: {
        organizationId_fromUnitId_toUnitId: {
          organizationId: org.id,
          fromUnitId: units[def.fromCode].id,
          toUnitId: units[def.toCode].id,
        },
      },
      update: { multiplier: def.multiplier },
      create: {
        organizationId: org.id,
        fromUnitId: units[def.fromCode].id,
        toUnitId: units[def.toCode].id,
        multiplier: def.multiplier,
      },
    });
  }

  const vat = await db.taxCategory.upsert({
    where: {
      organizationId_code: { organizationId: org.id, code: 'VAT-STD' },
    },
    update: {
      name: 'Standard VAT',
      rate: '13.0000',
      taxType: 'VAT',
      effectiveFrom: new Date('2005-01-14T00:00:00.000Z'),
    },
    create: {
      organizationId: org.id,
      name: 'Standard VAT',
      code: 'VAT-STD',
      rate: '13.0000',
      taxType: 'VAT',
      effectiveFrom: new Date('2005-01-14T00:00:00.000Z'),
    },
  });

  const suppliers: Record<string, SeedContext> = {};
  for (const def of SUPPLIERS) {
    const supplier = await db.supplier.upsert({
      where: {
        organizationId_code: { organizationId: org.id, code: def.code },
      },
      update: {
        name: def.name,
        contact: def.contact,
        paymentTerms: def.paymentTerms,
        creditLimit: def.creditLimit,
      },
      create: {
        organizationId: org.id,
        name: def.name,
        code: def.code,
        contact: def.contact,
        paymentTerms: def.paymentTerms,
        creditLimit: def.creditLimit,
      },
    });
    suppliers[def.code] = supplier;
  }

  for (const def of CUSTOMERS) {
    await db.customer.upsert({
      where: {
        organizationId_code: { organizationId: org.id, code: def.code },
      },
      update: {
        name: def.name,
        phone: def.phone,
        address: def.address,
        creditLimit: def.creditLimit,
      },
      create: {
        organizationId: org.id,
        name: def.name,
        code: def.code,
        phone: def.phone,
        address: def.address,
        creditLimit: def.creditLimit,
      },
    });
  }

  for (const name of EXPENSE_CATEGORIES) {
    await db.expenseCategory.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { organizationId: org.id, name },
    });
  }

  const locations: Record<string, SeedContext> = {};
  for (const def of [
    { code: 'LOC-01', name: 'Main Floor' },
    { code: 'LOC-02', name: 'Back Store' },
  ]) {
    const location = await db.inventoryLocation.upsert({
      where: { storeId_code: { storeId: store.id, code: def.code } },
      update: { name: def.name },
      create: { storeId: store.id, name: def.name, code: def.code },
    });
    locations[def.code] = location;
  }

  const categories: Record<string, SeedContext | null> = {};
  for (const name of CATEGORIES) {
    categories[name] = await db.category.findUnique({
      where: { organizationId_name: { organizationId: org.id, name } },
    });
  }
  const brands: Record<string, SeedContext | null> = {};
  for (const name of BRANDS) {
    brands[name] = await db.brand.findUnique({
      where: { organizationId_name: { organizationId: org.id, name } },
    });
  }

  for (const def of PRODUCTS) {
    const product = await db.product.upsert({
      where: {
        organizationId_sku: { organizationId: org.id, sku: def.sku },
      },
      update: {
        name: def.name,
        categoryId: categories[def.category]?.id ?? null,
        brandId: def.brand ? (brands[def.brand]?.id ?? null) : null,
        unitId: units[def.unit]?.id ?? null,
        taxCategoryId: vat.id,
        defaultPurchasePrice: def.purchase,
        defaultSellingPrice: def.retail,
        reorderLevel: def.reorderLevel,
        reorderQuantity: def.reorderQuantity,
      },
      create: {
        organizationId: org.id,
        name: def.name,
        sku: def.sku,
        categoryId: categories[def.category]?.id ?? null,
        brandId: def.brand ? (brands[def.brand]?.id ?? null) : null,
        unitId: units[def.unit]?.id ?? null,
        taxCategoryId: vat.id,
        defaultPurchasePrice: def.purchase,
        defaultSellingPrice: def.retail,
        reorderLevel: def.reorderLevel,
        reorderQuantity: def.reorderQuantity,
      },
    });

    await db.productBarcode.upsert({
      where: {
        organizationId_barcode: {
          organizationId: org.id,
          barcode: def.barcode,
        },
      },
      update: { productId: product.id, isPrimary: true },
      create: {
        organizationId: org.id,
        productId: product.id,
        barcode: def.barcode,
        isPrimary: true,
      },
    });

    const price = await db.productPrice.findFirst({
      where: { productId: product.id, priceType: 'retail' },
    });
    if (price) {
      await db.productPrice.update({
        where: { id: price.id },
        data: { amount: def.retail },
      });
    } else {
      await db.productPrice.create({
        data: {
          productId: product.id,
          priceType: 'retail',
          amount: def.retail,
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
    }

    const batchNumber = `BATCH-${def.sku}-001`;
    const manufactureDate = new Date('2026-01-10T00:00:00.000Z');
    const expiryDate = new Date('2026-01-10T00:00:00.000Z');
    expiryDate.setUTCMonth(expiryDate.getUTCMonth() + def.batchExpiryMonths);
    const batch = await db.productBatch.findFirst({
      where: { productId: product.id, batchNumber },
    });
    if (batch) {
      await db.productBatch.update({
        where: { id: batch.id },
        data: {
          supplierId: suppliers['SNP-001'].id,
          unitCost: def.purchase,
          manufactureDate,
          expiryDate,
        },
      });
    } else {
      await db.productBatch.create({
        data: {
          productId: product.id,
          supplierId: suppliers['SNP-001'].id,
          batchNumber,
          manufactureDate,
          expiryDate,
          unitCost: def.purchase,
        },
      });
    }
  }

  return {
    version: DEV_SEED_VERSION,
    seededAt: now.toISOString(),
    organizationId: org.id,
    storeId: store.id,
    products: PRODUCTS.length,
    permissions: DEV_PERMISSION_CODES.length,
    locations: Object.keys(locations).length,
  };
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter });
  await db.$connect();
  try {
    const summary = await runSeed(db);
    console.log(
      `seed v${summary.version}: org ${summary.organizationId}, store ${summary.storeId}, ` +
        `${summary.products} products, ${summary.permissions} permissions. ` +
        `Dev demo user password: ${DEV_SEED_PASSWORD} (dev only).`,
    );
  } finally {
    await db.$disconnect();
  }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
