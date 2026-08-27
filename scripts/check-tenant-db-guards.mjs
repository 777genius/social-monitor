import { existsSync, globSync, readFileSync } from 'node:fs';

const contractPath = 'ops/security/tenant-db-guard-contract.json';
const schemaPath = 'prisma/schema.prisma';
const publicationBootstrapPath =
  'ops/deploy/reader-summary-publication-pre-migration.sql';
const productionRuntimeComposePath =
  'ops/deploy/production-runtime/compose.postgres-runtime.yml';
const publicationDeployLibraryPath =
  'ops/deploy/reader-summary-publication-deploy-lib.sh';

const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const schema = readFileSync(schemaPath, 'utf8');
const migrationFiles = globSync('prisma/migrations/*/migration.sql').sort();
const migrations = migrationFiles.map((file) => ({
  file,
  sql: readFileSync(file, 'utf8'),
}));
const migrationSql = migrations.map((migration) => migration.sql).join('\n');
const violations = [];

if (contract.schemaVersion !== 3) {
  violations.push(`${contractPath}: schemaVersion must be 3`);
}

if (contract.posture !== 'rls_enforced_tenant_guardrails') {
  violations.push(`${contractPath}: posture must be rls_enforced_tenant_guardrails`);
}

if (typeof contract.owner !== 'string' || contract.owner.trim().length === 0) {
  violations.push(`${contractPath}: owner must be non-empty`);
}

const modelsByTable = parseModels(schema);
const knownTables = new Set(modelsByTable.keys());
const tenantRootTables = new Set(contract.tenantRootTables ?? []);
const tenantOwnedTables = new Set(contract.tenantOwnedTables ?? []);
const tenantScopedSystemTables = new Map(
  (contract.tenantScopedSystemTables ?? []).map((entry) => [entry.table, entry]),
);
const indirectTenantOwnedTables = new Map(
  (contract.indirectTenantOwnedTables ?? []).map((entry) => [entry.table, entry]),
);
const tenantScopedAssociations = contract.tenantScopedAssociations ?? [];
const forwardRlsCoverage = contract.forwardRlsCoverage ?? [];
const sharedTables = new Map((contract.sharedTables ?? []).map((entry) => [entry.table, entry]));

for (const table of tenantRootTables) {
  const model = modelsByTable.get(table);
  if (model === undefined) {
    violations.push(`${contractPath}: tenantRootTables references unknown table "${table}"`);
    continue;
  }
  if (model.fields.has('tenantId')) {
    violations.push(`${schemaPath}: tenant root table "${table}" must scope through its id`);
  }
}

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

for (const [table, entry] of indirectTenantOwnedTables) {
  if (!knownTables.has(table)) {
    violations.push(`${contractPath}: indirectTenantOwnedTables references unknown table "${table}"`);
  }
  if (!knownTables.has(entry.parentTable)) {
    violations.push(
      `${contractPath}: indirect tenant table "${table}" references unknown parent "${entry.parentTable}"`,
    );
  }
  if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
    violations.push(`${contractPath}: indirect tenant table "${table}" must explain reason`);
  }
}

for (const association of tenantScopedAssociations) {
  assertTenantScopedAssociation(association);
}

for (const coverage of forwardRlsCoverage) {
  assertForwardRlsCoverage(coverage);
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
  const classifications = [
    tenantRootTables.has(table),
    tenantOwnedTables.has(table),
    tenantScopedSystemTables.has(table),
    indirectTenantOwnedTables.has(table),
    sharedTables.has(table),
  ].filter(Boolean).length;
  if (classifications === 0) {
    violations.push(`${contractPath}: mapped Prisma table "${table}" must be classified as tenant-owned, tenant-scoped system or shared`);
  } else if (classifications > 1) {
    violations.push(`${contractPath}: mapped Prisma table "${table}" has overlapping classifications`);
  }
}

assertRlsMigration();

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
  const createTable = migrationSql.match(
    new RegExp(`CREATE TABLE "${escapeRegex(table)}" \\(([\\s\\S]*?)\\n\\);`),
  )?.[1];
  if (createTable === undefined) {
    violations.push(`committed migration history must create table "${table}"`);
    return;
  }

  const additiveColumn = migrationSql.match(
    new RegExp(
      `ALTER TABLE "${escapeRegex(table)}"[^;]*?`
      + `ADD COLUMN "${escapeRegex(column)}"[^;]*;`,
    ),
  );
  if (!createTable.includes(`"${column}"`) && additiveColumn === null) {
    violations.push(`committed migration history must create "${table}"."${column}"`);
  }
}

function assertRlsMigration() {
  const rlsMigrationPaths = contract.rlsMigrationPaths;
  if (
    !Array.isArray(rlsMigrationPaths) ||
    rlsMigrationPaths.length === 0 ||
    rlsMigrationPaths.some(
      (path) => typeof path !== 'string' || path.trim().length === 0 || !existsSync(path),
    )
  ) {
    violations.push(`${contractPath}: rlsMigrationPaths must reference committed migrations`);
    return;
  }
  const rlsMigrations = rlsMigrationPaths.map((path) => ({
    path,
    sql: readFileSync(path, 'utf8'),
  }));
  const rlsMigration = rlsMigrations.map((migration) => migration.sql).join('\n');
  const systemCapabilityRole = contract.systemCapabilityRole;
  if (
    typeof systemCapabilityRole !== 'string' ||
    systemCapabilityRole.trim().length === 0
  ) {
    violations.push(`${contractPath}: systemCapabilityRole must be non-empty`);
  }
  for (const required of [
    'ENABLE ROW LEVEL SECURITY',
    'FORCE ROW LEVEL SECURITY',
    'CREATE POLICY tenant_isolation',
    "current_setting('social_monitor.tenant_id', TRUE)",
    "current_setting('social_monitor.workspace_id', TRUE)",
    "current_setting('social_monitor.system_access', TRUE)",
    `pg_has_role(
        current_user,
        '${systemCapabilityRole}',`,
  ]) {
    if (!rlsMigration.includes(required)) {
      violations.push(`${contractPath}: RLS migrations are missing requirement "${required}"`);
    }
  }
  for (const table of [
    ...tenantRootTables,
    ...tenantOwnedTables,
    ...tenantScopedSystemTables.keys(),
    ...indirectTenantOwnedTables.keys(),
  ]) {
    const protection = [...rlsMigrations]
      .reverse()
      .find(
        (migration) =>
          migration.sql.includes(`'${table}'`) ||
          migration.sql.includes(`"${table}"`),
      );
    if (protection === undefined) {
      violations.push(`${contractPath}: protected table "${table}" is missing from RLS migrations`);
      continue;
    }
    const creation = migrations.find((migration) =>
      migration.sql.includes(`CREATE TABLE "${table}"`),
    );
    if (creation !== undefined && protection.path < creation.file) {
      violations.push(
        `${protection.path}: RLS protection for "${table}" must not precede its creation in ${creation.file}`,
      );
    }
  }
  for (const migration of rlsMigrations) {
    if (!migration.sql.includes('@social-monitor-forward-migration')) {
      violations.push(`${migration.path}: RLS migration must be marked as a forward migration`);
    }
    if (migration.sql.includes("current_setting('application_name'")) {
      violations.push(
        `${migration.path}: application_name is user-controlled and must not authorize system RLS access`,
      );
    }
  }

  const publicationBootstrap = readFileSync(publicationBootstrapPath, 'utf8');
  for (const required of [
    "social_monitor.bootstrap_system_runtime_role",
    "CREATE ROLE social_monitor_tenant_system_runtime",
    "GRANT social_monitor_tenant_system_runtime TO %I",
  ]) {
    if (!publicationBootstrap.includes(required)) {
      violations.push(`${publicationBootstrapPath}: missing system role bootstrap "${required}"`);
    }
  }
  assertPublicationBootstrapProtectsForwardOwnerTables(publicationBootstrap);

  const productionRuntimeCompose = readFileSync(
    productionRuntimeComposePath,
    'utf8',
  );
  const productionRuntimeComposeWithSentinel =
    `${productionRuntimeCompose}\n  __end__:\n`;
  for (const service of [
    'ingestion-worker',
    'intelligence-worker',
    'delivery-service',
    'event-relay',
    'daily-runner',
  ]) {
    const serviceBlock = productionRuntimeComposeWithSentinel.match(
      new RegExp(
        `^  ${escapeRegex(service)}:\\n([\\s\\S]*?)(?=^  [a-z_][a-z0-9_-]*:)`,
        'm',
      ),
    )?.[1];
    if (serviceBlock === undefined || !serviceBlock.includes('SYSTEM_DATABASE_URL')) {
      violations.push(`${productionRuntimeComposePath}: ${service} must use SYSTEM_DATABASE_URL`);
    }
    if (
      service === 'daily-runner' &&
      !serviceBlock?.includes('POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS: "30000"')
    ) {
      violations.push(`${productionRuntimeComposePath}: daily-runner must tolerate 30s PostgreSQL admission latency`);
    }
  }
  const apiBlock = productionRuntimeComposeWithSentinel.match(
    /^ {2}api:\n([\s\S]*?)(?=^ {2}[a-z_][a-z0-9_-]*:)/m,
  )?.[1];
  if (apiBlock?.includes('SYSTEM_DATABASE_URL') === true) {
    violations.push(`${productionRuntimeComposePath}: API must not use SYSTEM_DATABASE_URL`);
  }

  const publicationDeployLibrary = readFileSync(
    publicationDeployLibraryPath,
    'utf8',
  );
  if (
    !publicationDeployLibrary.includes(
      'READER_SUMMARY_TENANT_SYSTEM_RUNTIME_ROLE=social_monitor_system_app',
    ) ||
    !publicationDeployLibrary.includes('--set=system_runtime_role="$system_runtime_role"')
  ) {
    violations.push(
      `${publicationDeployLibraryPath}: production bootstrap must bind the reviewed system runtime role`,
    );
  }
  for (const required of [
    'ensure_system_database_url_deploy_contract',
    'reader_summary_publication_validate_runtime_database_urls',
    'validate_reader_summary_system_database_auth',
    'READER_SUMMARY_PUBLICATION_MIGRATOR_ROLE=$READER_SUMMARY_TENANT_SYSTEM_RUNTIME_ROLE',
    "'social_monitor_tenant_system_runtime', 'MEMBER'",
  ]) {
    if (!publicationDeployLibrary.includes(required)) {
      violations.push(`${publicationDeployLibraryPath}: missing system deploy contract guard "${required}"`);
    }
  }
}

function assertPublicationBootstrapProtectsForwardOwnerTables(publicationBootstrap) {
  const protectedTableLists = [
    ...publicationBootstrap.matchAll(
      /relation\.relname NOT IN \(([\s\S]*?)\n {6}\)/g,
    ),
  ].map((match) =>
    new Set([...match[1].matchAll(/'([^']+)'/g)].map((tableMatch) => tableMatch[1])),
  );
  if (protectedTableLists.length < 3) {
    violations.push(
      `${publicationBootstrapPath}: ordinary ownership transfer must keep explicit protected-table lists`,
    );
    return;
  }
  const publicationOwnedForwardTables = forwardRlsCoverage
    .filter((coverage) => coverage.ownerRole === 'social_monitor_reader_summary_publication_owner')
    .map((coverage) => coverage.table);
  for (const table of publicationOwnedForwardTables) {
    const missingListIndex = protectedTableLists.findIndex(
      (protectedTables) => !protectedTables.has(table),
    );
    if (missingListIndex !== -1) {
      violations.push(
        `${publicationBootstrapPath}: publication-owned forward table "${table}" `
        + `must be excluded from ordinary ownership transfer list ${missingListIndex + 1}`,
      );
    }
  }
}

function assertForwardRlsCoverage(coverage) {
  for (const field of ['table', 'migrationPath', 'ownerRole']) {
    if (typeof coverage[field] !== 'string' || coverage[field].trim().length === 0) {
      violations.push(`${contractPath}: forward RLS coverage must define ${field}`);
      return;
    }
  }
  if (!knownTables.has(coverage.table)) {
    violations.push(
      `${contractPath}: forward RLS coverage references unknown table "${coverage.table}"`,
    );
    return;
  }
  if (
    !Array.isArray(contract.rlsMigrationPaths) ||
    !contract.rlsMigrationPaths.includes(coverage.migrationPath) ||
    !existsSync(coverage.migrationPath)
  ) {
    violations.push(
      `${contractPath}: forward RLS coverage for "${coverage.table}" `
      + 'must reference a declared RLS migration',
    );
    return;
  }
  const sql = readFileSync(coverage.migrationPath, 'utf8').replace(/\n/g, ' ');
  for (const [label, pattern] of [
    [
      'owner role',
      new RegExp(`SET LOCAL ROLE "${escapeRegex(coverage.ownerRole)}"`),
    ],
    [
      'ENABLE ROW LEVEL SECURITY',
      new RegExp(
        `ALTER TABLE "${escapeRegex(coverage.table)}"\\s+ENABLE ROW LEVEL SECURITY`,
      ),
    ],
    [
      'FORCE ROW LEVEL SECURITY',
      new RegExp(
        `ALTER TABLE "${escapeRegex(coverage.table)}"\\s+FORCE ROW LEVEL SECURITY`,
      ),
    ],
    [
      'tenant_isolation policy',
      new RegExp(
        `CREATE POLICY "tenant_isolation"\\s+ON "${escapeRegex(coverage.table)}"`,
      ),
    ],
  ]) {
    if (!pattern.test(sql)) {
      violations.push(
        `${coverage.migrationPath}: "${coverage.table}" is missing explicit ${label}`,
      );
    }
  }
}

function assertTenantScopedAssociation(association) {
  for (const field of [
    'childTable',
    'parentTable',
    'constraintName',
    'reason',
  ]) {
    if (typeof association[field] !== 'string' || association[field].trim().length === 0) {
      violations.push(`${contractPath}: tenant scoped association must define ${field}`);
      return;
    }
  }
  if (!knownTables.has(association.childTable) || !knownTables.has(association.parentTable)) {
    violations.push(
      `${contractPath}: tenant scoped association references unknown tables `
      + `"${association.childTable}" -> "${association.parentTable}"`,
    );
    return;
  }
  if (
    !Array.isArray(association.childColumns) ||
    !Array.isArray(association.parentColumns) ||
    association.childColumns.length < 3 ||
    association.childColumns.length !== association.parentColumns.length
  ) {
    violations.push(
      `${contractPath}: tenant scoped association "${association.constraintName}" `
      + 'must define matching id, tenant and workspace columns',
    );
    return;
  }
  const quotedChildColumns = association.childColumns
    .map((column) => `"${escapeRegex(column)}"`)
    .join('\\s*,\\s*');
  const quotedParentColumns = association.parentColumns
    .map((column) => `"${escapeRegex(column)}"`)
    .join('\\s*,\\s*');
  const constraintPattern = new RegExp(
    `CONSTRAINT "${escapeRegex(association.constraintName)}"\\s+`
    + `FOREIGN KEY \\(${quotedChildColumns}\\)\\s+`
    + `REFERENCES "${escapeRegex(association.parentTable)}" `
    + `\\(${quotedParentColumns}\\)`,
  );
  if (!constraintPattern.test(migrationSql.replace(/\n/g, ' '))) {
    violations.push(
      `committed migration history must enforce tenant scoped association `
      + `"${association.constraintName}"`,
    );
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
