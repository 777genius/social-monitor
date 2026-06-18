import { globSync, readFileSync } from 'node:fs';

const contractPath = 'ops/security/tenant-db-guard-contract.json';
const schemaPath = 'prisma/schema.prisma';

const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const schema = readFileSync(schemaPath, 'utf8');
const migrationSql = globSync('prisma/migrations/*/migration.sql')
  .sort()
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');
const violations = [];

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (contract.posture !== 'pre_rls_tenant_guardrails') {
  violations.push(`${contractPath}: posture must be pre_rls_tenant_guardrails`);
}

if (typeof contract.owner !== 'string' || contract.owner.trim().length === 0) {
  violations.push(`${contractPath}: owner must be non-empty`);
}

const modelsByTable = parseModels(schema);
const knownTables = new Set(modelsByTable.keys());
const tenantOwnedTables = new Set(contract.tenantOwnedTables ?? []);
const tenantScopedSystemTables = new Map(
  (contract.tenantScopedSystemTables ?? []).map((entry) => [entry.table, entry]),
);
const sharedTables = new Map((contract.sharedTables ?? []).map((entry) => [entry.table, entry]));

for (const table of tenantOwnedTables) {
  const model = modelsByTable.get(table);
  if (model === undefined) {
    violations.push(`${contractPath}: tenantOwnedTables references unknown table "${table}"`);
    continue;
  }

  const workspaceIdRequired = !new Set(['users', 'workspaces']).has(table);
  assertTenantColumns(table, model, { tenantIdRequired: true, workspaceIdRequired });
  assertTenantPrefixedConstraint(table, model);
  assertMigrationColumn(table, 'tenant_id');
  if (workspaceIdRequired) {
    assertMigrationColumn(table, 'workspace_id');
  }
}

for (const [table, entry] of tenantScopedSystemTables) {
  const model = modelsByTable.get(table);
  if (model === undefined) {
    violations.push(`${contractPath}: tenantScopedSystemTables references unknown table "${table}"`);
    continue;
  }

  if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
    violations.push(`${contractPath}: tenant scoped system table "${table}" must explain reason`);
  }

  assertTenantColumns(table, model, {
    tenantIdRequired: entry.tenantIdRequired === true,
    workspaceIdRequired: entry.workspaceIdRequired === true,
  });

  if (entry.tenantPrefixedIndexRequired === true) {
    assertTenantPrefixedConstraint(table, model);
  }
}

for (const [table, entry] of sharedTables) {
  if (!knownTables.has(table)) {
    violations.push(`${contractPath}: sharedTables references unknown table "${table}"`);
  }

  if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
    violations.push(`${contractPath}: shared table "${table}" must explain reason`);
  }
}

for (const table of knownTables) {
  if (!tenantOwnedTables.has(table) && !tenantScopedSystemTables.has(table) && !sharedTables.has(table)) {
    violations.push(`${contractPath}: mapped Prisma table "${table}" must be classified as tenant-owned, tenant-scoped system or shared`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Tenant database guardrails OK');

function parseModels(source) {
  const models = new Map();
  const modelPattern = /model\s+(\w+)\s+\{([\s\S]*?)\n\}/g;

  for (const match of source.matchAll(modelPattern)) {
    const [, name, body] = match;
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name;
    models.set(table, {
      name,
      body,
      fields: new Set([...body.matchAll(/^\s*(\w+)\s+/gm)].map((fieldMatch) => fieldMatch[1])),
      constraints: [...body.matchAll(/@@(?:id|index|unique)\(\[([^\]]+)\]/g)].map((constraintMatch) =>
        constraintMatch[1]
          .split(',')
          .map((part) => part.trim().replace(/\(.*$/, '')),
      ),
    });
  }

  return models;
}

function assertTenantColumns(table, model, requirements) {
  if (requirements.tenantIdRequired && !model.fields.has('tenantId')) {
    violations.push(`${schemaPath}: tenant-owned table "${table}" must include tenantId`);
  }

  if (requirements.workspaceIdRequired && !model.fields.has('workspaceId')) {
    violations.push(`${schemaPath}: tenant-owned table "${table}" must include workspaceId`);
  }
}

function assertTenantPrefixedConstraint(table, model) {
  if (!model.constraints.some((constraint) => constraint[0] === 'tenantId')) {
    violations.push(`${schemaPath}: table "${table}" must have an @@id/@@index/@@unique prefixed by tenantId`);
  }
}

function assertMigrationColumn(table, column) {
  const createTable = migrationSql.match(new RegExp(`CREATE TABLE "${escapeRegex(table)}" \\(([\\s\\S]*?)\\n\\);`))?.[1];
  if (createTable === undefined) {
    violations.push(`committed migration history must create table "${table}"`);
    return;
  }

  if (!createTable.includes(`"${column}"`)) {
    violations.push(`committed migration history must create "${table}"."${column}"`);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
