import pg from 'pg';
const { Client } = pg;
const url = "postgresql://minimart:changeme@127.0.0.1:5432/minimart_test?schema=public";
const c = new Client({ connectionString: url });
await c.connect();
const r = await c.query('SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name');
console.log(r.rows.map(x => x.migration_name).join('\n'));
await c.end();