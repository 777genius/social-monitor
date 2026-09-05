import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

// No ambient DATABASE_URL and no existing project database. The supplied URL is
// only a local test-server admin connection; every table/row lives in a new DB.
export async function withReaderDeliveryPostgresFixture(
  operation: (fixture: { adminUrl: string; runtimeUrl: string; database: Pool }) => Promise<void>,
): Promise<void> {
  const configured = process.env.READER_DELIVERY_TEST_ADMIN_DATABASE_URL;
  if (!configured) throw new Error('READER_DELIVERY_TEST_ADMIN_DATABASE_URL required; PostgreSQL gate never skips');
  const url = new URL(configured);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Reader delivery fixture requires an explicit local disposable PostgreSQL server');
  }
  if (url.search) throw new Error('Reader delivery fixture admin URL must not include connection overrides');
  const suffix = randomBytes(8).toString('hex');
  const name = `reader_delivery_fixture_${suffix}`;
  const role = `${name}_runtime`;
  const systemRole = `${name}_system`;
  const password = randomBytes(24).toString('hex');
  const admin = new Pool({ connectionString: configured, max: 1 });
  let database: Pool | undefined;
  let created = false;
  let roleCreated = false;
  let systemCreated = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`);
    roleCreated = true;
    await admin.query(`CREATE ROLE "${systemRole}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    systemCreated = true;
    url.pathname = `/${name}`;
    const adminUrl = url.toString();
    database = new Pool({ connectionString: adminUrl, max: 1 });
    await installDeliveryTables(database, role, systemRole);
    url.username = role;
    url.password = password;
    await operation({ adminUrl, runtimeUrl: url.toString(), database });
  } finally {
    await database?.end();
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
    if (systemCreated) await admin.query(`DROP ROLE "${systemRole}"`);
    await admin.end();
  }
}

async function installDeliveryTables(database: Pool, role: string, systemRole: string): Promise<void> {
  const baseline = readFileSync('prisma/migrations/20260618143000_baseline/migration.sql', 'utf8');
  const commands = readFileSync('prisma/migrations/20260723120000_transactional_scan_command_outbox/migration.sql', 'utf8');
  const rls = readFileSync('prisma/migrations/20260723153000_tenant_row_level_security/migration.sql', 'utf8');
  const required = (sql: string, pattern: RegExp): string => {
    const found = sql.match(pattern)?.[0];
    if (!found) throw new Error(`Fixture migration definition missing: ${pattern.source}`);
    return found;
  };
  await database.query(required(baseline, /CREATE TYPE "OutboxStatus"[^;]+;/));
  for (const table of ['realtime_events', 'inbox_records', 'outbox_events']) {
    await database.query(required(baseline, new RegExp(`CREATE TABLE "${table}" \\([\\s\\S]*?\\n\\);`)));
    for (const index of baseline.matchAll(new RegExp(`CREATE (?:UNIQUE )?INDEX [^;]+ ON "${table}"[^;]+;`, 'g'))) {
      await database.query(index[0]);
    }
  }
  await database.query(required(commands, /CREATE TYPE "OutboxMessageKind"[^;]+;/));
  await database.query(required(commands, /ALTER TABLE "outbox_events"[\s\S]*?;/));
  for (const fn of rls.matchAll(/CREATE OR REPLACE FUNCTION public\.social_monitor_rls_[\s\S]*?\$\$;/g)) {
    // Preserve canonical policies with an isolated capability role, never alter
    // roles belonging to another project/server fixture.
    await database.query(fn[0].replaceAll('social_monitor_tenant_system_runtime', systemRole));
  }
  await database.query(required(rls, /ALTER TABLE "inbox_records" ENABLE[\s\S]*?\n {2}\);/));
  await database.query(`ALTER TABLE "realtime_events" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "realtime_events" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON "realtime_events"
      USING (public.social_monitor_rls_workspace_match(tenant_id, workspace_id))
      WITH CHECK (public.social_monitor_rls_workspace_match(tenant_id, workspace_id));
    GRANT USAGE ON SCHEMA public TO "${role}";
    GRANT SELECT, INSERT ON "realtime_events", "inbox_records" TO "${role}";`);
}
