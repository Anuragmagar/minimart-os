import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const TEST_DATABASE = 'minimart_test';

export function resolveTestUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${TEST_DATABASE}`;
  return parsed.toString();
}

export async function provisionTestDatabase(): Promise<string> {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL is required for database integration tests');
  }
  const testUrl = resolveTestUrl(baseUrl);

  const admin = new Client({ connectionString: baseUrl });
  await admin.connect();
  const exists = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [TEST_DATABASE],
  );
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  }
  await admin.end();

  const serviceRoot = path.resolve(fileURLToPath(import.meta.url), '../../..');
  const prismaCliEntry = path.join(
    serviceRoot,
    'node_modules',
    'prisma',
    'build',
    'index.js',
  );
  execFileSync(process.execPath, [prismaCliEntry, 'migrate', 'deploy'], {
    cwd: serviceRoot,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: testUrl },
  });

  return testUrl;
}
