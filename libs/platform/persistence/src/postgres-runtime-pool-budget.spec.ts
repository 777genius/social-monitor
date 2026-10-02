import { runInNewContext } from 'node:vm';
import * as ts from 'typescript';
import {
  POSTGRES_RUNTIME_CONNECTION_FACTORIES,
  POSTGRES_RUNTIME_POOL_MINIMUM,
  POSTGRES_RUNTIME_POOL_LIMITS,
  PRODUCTION_POSTGRES_RUNTIME_INVENTORY,
} from './postgres-runtime-pool-budget';
import {
  BOUNDED_POSTGRES_TEST_ONLY_FILES,
  BOUNDED_POSTGRES_TEST_POOL_MAXIMUMS,
} from './postgres-runtime-pool-budget-test-inventory';
import {
  directDatabaseConstructions,
  directPoolOptions,
  expectedSourceList,
  readComposeService,
  readSource,
  runtimeSourceFiles,
} from './postgres-runtime-pool-budget-test-source';

function withFallibleSiblingSetup(source: string): string {
  return source.replace(' as unknown as Pg.Pool);\n    try {', ` as unknown as Pg.Pool),
      reader = (() : ReturnType<typeof databaseSnapshotReader> => {
        if (rows.length) throw new Error('synthetic setup failure');
        return databaseSnapshotReader('synthetic-db-composition');
      })();
    try {`).replace("      const reader = databaseSnapshotReader('synthetic-db-composition');\n", '');
}

function expectRawDependencySyntax(path: string, source: string): void {
  if (path === 'scripts/lib/social-source-private-input-database.spec.ts') {
    // A namespace can bypass the named-constructor budget resolver. Admit only
    // the installed-constructor spy, with every namespace reference checked.
    const spyBinding = "const pg = require(" + "'pg') as typeof Pg;";
    expect(source.split(spyBinding)).toHaveLength(2);
    expectSpyNamespaceUsage(path, source, spyBinding);
    source = source.replace(spyBinding, '');
  }
  expect(source).not.toMatch(
    /(?:require\s*\(\s*['"](?:pg|@prisma\/adapter-pg)['"]\s*\)|import\s*\(\s*['"](?:pg|@prisma\/adapter-pg)['"]\s*\)|import\s+\*\s+as\s+\w+\s+from\s+['"](?:pg|@prisma\/adapter-pg)['"])/,
  );
}

function expectSpyNamespaceUsage(path: string, source: string, spyBinding: string): void {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, types: [] };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => name === path ? file : undefined;
  const program = ts.createProgram([path], options, host);
  expect(program.getSyntacticDiagnostics(file)).toEqual([]);
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  const identifier = (node: ts.Node | undefined, name: string): boolean =>
    node !== undefined && ts.isIdentifier(node) && node.text === name;
  const method = (node: ts.Node, receiver: string, name: string): node is ts.CallExpression =>
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
    node.expression.questionDotToken === undefined && node.questionDotToken === undefined &&
    identifier(node.expression.expression, receiver) && node.expression.name.text === name;

  const imports = nodes.filter((node): node is ts.ImportDeclaration =>
    ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) &&
    node.moduleSpecifier.text === 'pg');
  expect(imports).toHaveLength(1);
  const clause = imports[0]?.importClause;
  if (!clause?.isTypeOnly || !clause.namedBindings ||
    !ts.isNamespaceImport(clause.namedBindings) || clause.namedBindings.name.text !== 'Pg') {
    throw new Error('Constructor spy requires its type-only namespace import');
  }
  const bindings = nodes.filter((node): node is ts.VariableStatement =>
    ts.isVariableStatement(node) && node.getText(file) === spyBinding);
  expect(bindings).toHaveLength(1);
  const binding = bindings[0]?.declarationList.declarations[0];
  if (!binding?.initializer || !ts.isAsExpression(binding.initializer) ||
    !ts.isTypeQueryNode(binding.initializer.type)) {
    throw new Error('Constructor spy requires its exact namespace binding');
  }
  const allowed = new Set<ts.Node>([
    clause.namedBindings.name, binding.name, binding.initializer.type.exprName,
  ]);

  const spies = nodes.filter((node): node is ts.CallExpression =>
    method(node, 'jest', 'spyOn') && identifier(node.arguments[0], 'pg'));
  expect(spies).toHaveLength(1);
  const spy = spies[0];
  if (!spy || spy.arguments.length !== 2 || !identifier(spy.arguments[0], 'pg') ||
    !spy.arguments[1] || !ts.isStringLiteral(spy.arguments[1]) || spy.arguments[1].text !== 'Pool') {
    throw new Error('Only the Pool constructor spy may receive the namespace');
  }
  const access = spy.parent;
  const mock = access.parent;
  const declaration = mock.parent;
  if (!ts.isPropertyAccessExpression(access) || access.expression !== spy ||
    access.name.text !== 'mockImplementation' || access.questionDotToken !== undefined ||
    !ts.isCallExpression(mock) || mock.expression !== access || mock.questionDotToken !== undefined ||
    mock.arguments.length !== 1 || !ts.isArrowFunction(mock.arguments[0]!) ||
    !ts.isVariableDeclaration(declaration) || declaration.initializer !== mock ||
    !identifier(declaration.name, 'constructor')) {
    throw new Error('Namespace admission requires the genuine mock implementation chain');
  }
  allowed.add(spy.arguments[0]!);
  const statement = declaration.parent.parent;
  const block = statement.parent;
  if (!ts.isVariableStatement(statement) || !ts.isBlock(block)) {
    throw new Error('Constructor spy must be scoped to its test block');
  }
  if (statement.declarationList.declarations.length !== 1) {
    throw new Error('Constructor spy must be the sole declaration before its protected try');
  }
  const cleanup = block.statements[block.statements.indexOf(statement) + 1];
  const restoreStatement = cleanup && ts.isTryStatement(cleanup) &&
    cleanup.finallyBlock?.statements.length === 1 ? cleanup.finallyBlock.statements[0] : undefined;
  if (!restoreStatement || !ts.isExpressionStatement(restoreStatement) ||
    !method(restoreStatement.expression, 'constructor', 'mockRestore') ||
    restoreStatement.expression.arguments.length !== 0) {
    throw new Error('Constructor spy must restore the same mock in its associated finally');
  }
  const restore = restoreStatement.expression;

  for (const node of nodes) {
    if (!ts.isIdentifier(node)) continue;
    if (node.text === 'pg' || node.text === 'Pg') {
      // Qualified namespace names are harmless only in a type reference.
      const parent = node.parent;
      const typeOnly = node.text === 'Pg' && ts.isQualifiedName(parent) &&
        parent.left === node && ts.isTypeReferenceNode(parent.parent);
      if (!allowed.has(node) && !typeOnly) {
        throw new Error('Unresolved pg namespace use bypasses constructor budgets');
      }
    }
    if (node.text === 'jest') {
      const access = node.parent;
      if (!ts.isPropertyAccessExpression(access) || access.expression !== node ||
        !ts.isCallExpression(access.parent) || access.parent.expression !== access ||
        !['fn', 'spyOn'].includes(access.name.text)) {
        throw new Error('Constructor spy must use the unmodified Jest test API');
      }
    }
    if (node.text === 'constructor' && node !== declaration.name) {
      const parent = node.parent;
      const assertion = ts.isCallExpression(parent) && identifier(parent.expression, 'expect') &&
        parent.arguments.length === 1 && parent.arguments[0] === node;
      const implementation = ts.isPropertyAccessExpression(parent) && parent.expression === node &&
        method(parent.parent, 'constructor', 'mockImplementation') &&
        parent.parent.arguments.length === 1 && ts.isArrowFunction(parent.parent.arguments[0]!);
      const restoration = ts.isPropertyAccessExpression(parent) && parent.expression === node &&
        parent.parent === restore;
      if (!assertion && !implementation && !restoration) {
        throw new Error('Constructor spy may only be asserted, mocked, and restored');
      }
    }
  }
}

describe('production PostgreSQL construction and entrypoint inventory', () => {
  const boundedPostgresTestOnlyFiles = BOUNDED_POSTGRES_TEST_ONLY_FILES;
  const sourceFiles = [...runtimeSourceFiles('apps'), ...runtimeSourceFiles('libs')];
  const completeDatabaseSourceFiles = [
    'test/feed-reader-summary-coverage-pool.integration.spec.ts',
    ...sourceFiles,
    ...runtimeSourceFiles('scripts'),
    ...runtimeSourceFiles('prisma').filter(
      (path) => !path.startsWith('prisma/generated/'),
    ),
  ];
  const productionSourceFiles = sourceFiles.filter(
    (path) => !path.endsWith('.spec.ts') && !path.endsWith('.test.ts'),
  );

  it('fails when a new Prisma runtime connection factory is not budgeted', () => {
    const discoveredFactories = productionSourceFiles
      .filter((path) =>
        readSource(path).includes('createPrismaPgRuntimeConnection('),
      )
      .filter(
        (path) => path !== 'libs/platform/persistence/src/postgres-runtime-pool.ts',
      )
      .sort();

    expect(discoveredFactories).toEqual(
      Object.values(POSTGRES_RUNTIME_CONNECTION_FACTORIES).sort(),
    );
  });

  it('inventories every direct pg Pool, PrismaPg, and PrismaClient construction', () => {
    const rawConstructions = completeDatabaseSourceFiles
      .flatMap((path) =>
        directDatabaseConstructions(readSource(path)).map(
          (constructor) => `${path}:${constructor}`,
        ),
      )
      .sort();

    // Cursor cleanup regression uses installed Pool lifecycle with a controlled wire client and an unused pool.
    expect(rawConstructions).toEqual(expectedSourceList(`
      libs/ingestion/adapters/persistence/prisma/article-capture-postgres.spec-support.ts:Pool
      libs/platform/persistence/src/postgres-runtime-pool-concurrency.spec.ts:Pool
      libs/platform/persistence/src/postgres-runtime-pool-concurrency.spec.ts:PrismaPg
      libs/platform/persistence/src/postgres-runtime-pool.ts:Pool
      libs/platform/persistence/src/postgres-runtime-pool.ts:PrismaPg
      prisma/seed.ts:Pool
      prisma/seed.ts:PrismaClient
      prisma/seed.ts:PrismaPg
      scripts/backfill-github-trending-feed.ts:Pool
      scripts/backfill-reader-summary-weekly-daily-certifications.ts:Pool
      scripts/build-reader-summary-recovery-terminal-manifest.ts:Pool
      scripts/capture-durable-backend-e2e-loop.ts:Pool
      scripts/capture-reader-summary-multi-day-quality-corpus.ts:Pool
      scripts/capture-reader-summary-multi-day-quality-target-manifest.ts:Pool
      scripts/capture-reader-summary-promotion-v2-canary-receipt.ts:Pool
      scripts/check-feed-promotion-index-recovery-postgres.ts:Pool
      scripts/check-feed-promotion-index-recovery.ts:Pool
      scripts/check-feed-promotion-keyset-plan-postgres.ts:Pool
      scripts/check-feed-promotion-keyset-plan-postgres.ts:Pool
      scripts/check-feed-promotion-keyset-plan-postgres.ts:PrismaPg
      scripts/check-github-repo-radar-prisma-live-e2e.ts:Pool
      scripts/check-hn-rss-recovery-local-postgres.ts:Pool
      scripts/check-reader-summary-daily-delivery-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-delivery-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-delivery-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-delivery-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-delivery-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-execution-cursor-postgres.ts:Pool
      scripts/check-reader-summary-daily-execution-cursor-postgres.ts:Pool
      scripts/check-reader-summary-daily-execution-cursor-postgres.ts:Pool
      scripts/check-reader-summary-daily-execution-cursor-postgres.ts:Pool
      scripts/check-reader-summary-daily-scan-terminal-repair-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-scan-terminal-repair-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-scan-terminal-repair-c1-postgres.ts:Pool
      scripts/check-reader-summary-multi-day-quality.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-production-regeneration-smoke.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-recovery-candidate-staging-postgres.ts:Pool
      scripts/check-reader-summary-recovery-candidate-staging-postgres.ts:Pool
      scripts/check-reader-summary-source-quality-trace.ts:Pool
      scripts/check-reader-summary-top-read-ranking.ts:Pool
      scripts/check-reader-summary-topic-map-real-data.ts:Pool
      scripts/check-reader-summary-weekly-daily-certifications-postgres.ts:Pool
      scripts/check-reader-summary-weekly-execution-receipt-postgres.ts:Pool
      scripts/check-reader-summary-weekly-production-postgres.ts:Pool
      scripts/check-source-query-planner-real-binding-canary.ts:Pool
      scripts/check-summary-feedback-calibration-report.ts:Pool
      scripts/check-summary-memory-product-loop.ts:Pool
      scripts/check-summary-topic-recommendation-rest-prisma-live.ts:Pool
      scripts/check-tenant-rls-postgres.ts:Pool
      scripts/check-tenant-rls-postgres.ts:Pool
      scripts/check-tenant-rls-postgres.ts:Pool
      scripts/check-tenant-rls-postgres.ts:Pool
      scripts/check-yesterday-reader-summary-artifact-quality.ts:Pool
      scripts/check-yesterday-social-collection-quality.ts:Pool
      scripts/import-hn-verified-remainder.ts:Pool
      scripts/import-rss-sep24-verified.postgres.spec.ts:Pool
      scripts/import-rss-sep24-verified.postgres.spec.ts:Pool
      scripts/import-rss-sep24-verified.ts:Pool
      scripts/lib/github-trending-durable-snapshot-reuse-postgres-fixture.ts:Pool
      scripts/lib/github-trending-durable-snapshot-reuse-postgres-fixture.ts:Pool
      scripts/lib/reader-summary-daily-canonical-recovery-v4-delivery-c1.ts:Pool
      scripts/lib/reader-summary-daily-canonical-recovery-v4-delivery-c1.ts:Pool
      scripts/lib/reader-summary-daily-canonical-recovery-v4-scan-terminal-repair-cli.ts:Pool
      scripts/lib/reader-summary-daily-cursor-fixture-cleanup.spec.ts:Pool
      scripts/lib/reader-summary-daily-cursor-fixture-cleanup.spec.ts:Pool
      scripts/lib/reader-summary-daily-terminal-runtime-connection.ts:Pool
      scripts/lib/reader-summary-production-day-scope.ts:Pool
      scripts/lib/reader-summary-promotion-v2-historical-postgres.ts:Pool
      scripts/lib/reader-summary-quality-dashboard-report-builder.ts:Pool
      scripts/lib/reader-summary-ready-delivery-postgres-fixture.ts:Pool
      scripts/lib/reader-summary-ready-delivery-postgres-fixture.ts:Pool
      scripts/lib/reader-summary-successor-fixture-migrations.ts:Pool
      scripts/lib/reader-value-postgres-fixture.ts:Pool
      scripts/lib/reader-value-postgres-fixture.ts:Pool
      scripts/lib/reader-value-postgres-fixture.ts:Pool
      scripts/lib/social-source-private-input-database.ts:Pool
      scripts/lib/yesterday-social-replay-support.ts:Pool
      scripts/prepare-reader-summary-successor-fixture.ts:Pool
      scripts/prepare-reader-summary-successor-fixture.ts:Pool
      scripts/read-reader-summary-daily-terminal-set-receipt.ts:Pool
      scripts/reader-summary-publication-postgres-legacy.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/run-hn-rss-recovery.ts:Pool
      scripts/run-reader-promotion-v2-production-canary.ts:Pool
      scripts/run-reader-summary-clean-real-day-collection.ts:Pool
      scripts/run-reader-summary-promotion-v2-rollback.ts:Pool
      scripts/run-reader-summary-weekly-production.ts:Pool
      scripts/run-reader-summary-weekly-review-producer.ts:Pool
      test/feed-reader-summary-coverage-pool.integration.spec.ts:Pool
      test/feed-reader-summary-coverage-pool.integration.spec.ts:PrismaPg
    `));
  });
  it('keeps the historical refresh race writer reachable only from its native test gate', () => {
    const helper = 'scripts/lib/reader-summary-new-input-refresh-native-concurrency.ts';
    const consumers = completeDatabaseSourceFiles.filter((path) =>
      path !== helper && !path.endsWith('.spec.ts') &&
      readSource(path).includes('reader-summary-new-input-refresh-native-concurrency'),
    );
    expect(consumers).toEqual(['scripts/check-reader-summary-new-input-refresh-postgres.ts']);
  });
  it('fails on every future raw database-client dependency bypass', () => {
    const rawDependencyFiles = completeDatabaseSourceFiles
      .filter((path) => {
        const source = readSource(path);
        return (
          /from\s+['"]pg['"]|require\s*\(\s*['"]pg['"]\s*\)|import\s*\(\s*['"]pg['"]\s*\)/.test(
            source,
          ) ||
          /from\s+['"]@prisma\/adapter-pg['"]|require\s*\(\s*['"]@prisma\/adapter-pg['"]\s*\)|import\s*\(\s*['"]@prisma\/adapter-pg['"]\s*\)/.test(
            source,
          ) ||
          /from\s+['"][^'"]*generated\/client\/client['"]/.test(source)
        );
      })
      .sort();

    // The large-daily and linear-UTF16 synthetic PostgreSQL contracts receive
    // existing clients and import only the PoolClient type. Inventory their
    // exact paths even though they construct no runtime pools.
    // The replay dispatch spec imports pg only to assert its throwing mock stays unused.
    // Cursor cleanup helper imports only the Pool type; its spec exercises the installed Pool lifecycle.
    // The socket regression spec and publication helpers import only client types.
    // Private-input reading constructs one min=0/max=1 pool per invocation and
    // releases/ends it in finally; its sibling spec spies on the CJS constructor.
    expect(rawDependencyFiles).toEqual(expectedSourceList(`
      libs/ingestion/adapters/persistence/prisma/article-capture-postgres.spec-support.ts
      libs/platform/persistence/src/postgres-runtime-pool-cleanup.ts
      libs/platform/persistence/src/postgres-runtime-pool-concurrency.spec.ts
      libs/platform/persistence/src/postgres-runtime-pool.spec.ts
      libs/platform/persistence/src/postgres-runtime-pool.ts
      prisma/seed.ts
      scripts/backfill-github-trending-feed.ts
      scripts/backfill-reader-summary-weekly-daily-certifications.ts
      scripts/build-reader-summary-recovery-terminal-manifest.ts
      scripts/capture-durable-backend-e2e-loop.ts
      scripts/capture-reader-summary-multi-day-quality-corpus.ts
      scripts/capture-reader-summary-multi-day-quality-target-manifest.ts
      scripts/capture-reader-summary-promotion-v2-canary-receipt.ts
      scripts/check-feed-promotion-index-recovery-postgres.ts
      scripts/check-feed-promotion-index-recovery.ts
      scripts/check-feed-promotion-keyset-plan-postgres.ts
      scripts/check-github-repo-radar-prisma-live-e2e.ts
      scripts/check-hn-rss-recovery-local-postgres.ts
      scripts/check-reader-summary-daily-delivery-c1-postgres.ts
      scripts/check-reader-summary-daily-execution-cursor-postgres.ts
      scripts/check-reader-summary-daily-scan-terminal-repair-c1-postgres.ts
      scripts/check-reader-summary-multi-day-quality.ts
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts
      scripts/check-reader-summary-production-regeneration-smoke.ts
      scripts/check-reader-summary-publication-postgres.ts
      scripts/check-reader-summary-ready-delivery-postgres.ts
      scripts/check-reader-summary-ready-recovery-postgres.ts
      scripts/check-reader-summary-recovery-candidate-staging-postgres.ts
      scripts/check-reader-summary-source-quality-trace.ts
      scripts/check-reader-summary-top-read-ranking.ts
      scripts/check-reader-summary-topic-map-real-data.ts
      scripts/check-reader-summary-weekly-daily-certifications-postgres.ts
      scripts/check-reader-summary-weekly-execution-receipt-postgres.ts
      scripts/check-reader-summary-weekly-production-postgres.ts
      scripts/check-source-query-planner-real-binding-canary.ts
      scripts/check-summary-feedback-calibration-report.ts
      scripts/check-summary-memory-product-loop.ts
      scripts/check-summary-topic-recommendation-rest-prisma-live.ts
      scripts/check-tenant-rls-postgres.ts
      scripts/check-yesterday-reader-summary-artifact-quality.ts
      scripts/check-yesterday-social-collection-quality.ts
      scripts/import-hn-verified-remainder.ts
      scripts/import-rss-sep24-verified.postgres.spec.ts
      scripts/import-rss-sep24-verified.spec.ts
      scripts/import-rss-sep24-verified.ts
      scripts/lib/github-trending-durable-snapshot-reuse-postgres-fixture.ts
      scripts/lib/github-trending-durable-snapshot-reuse.postgres.spec.ts
      scripts/lib/github-trending-durable-snapshot-reuse.prisma.spec.ts
      scripts/lib/github-trending-durable-snapshot-reuse.ts
      scripts/lib/reader-promotion-v2-production-canary-postgres-store.ts
      scripts/lib/reader-summary-current-publication-bindings.spec.ts
      scripts/lib/reader-summary-current-publication-bindings.ts
      scripts/lib/reader-summary-daily-canonical-recovery-v4-delivery-c1.ts
      scripts/lib/reader-summary-daily-canonical-recovery-v4-scan-terminal-repair-cli.ts
      scripts/lib/reader-summary-daily-cursor-fixture-cleanup.spec.ts
      scripts/lib/reader-summary-daily-cursor-fixture-cleanup.ts
      scripts/lib/reader-summary-daily-production-owner-topology-postgres.ts
      scripts/lib/reader-summary-daily-terminal-runtime-connection.spec.ts
      scripts/lib/reader-summary-daily-terminal-runtime-connection.ts
      scripts/lib/reader-summary-large-daily-publication-postgres-contract.ts
      scripts/lib/reader-summary-linear-utf16-postgres-contract.ts
      scripts/lib/reader-summary-new-input-refresh-native-concurrency.ts
      scripts/lib/reader-summary-production-day-scope.spec.ts
      scripts/lib/reader-summary-production-day-scope.ts
      scripts/lib/reader-summary-promotion-v2-historical-postgres.ts
      scripts/lib/reader-summary-promotion-v2-rollback-lifecycle-fixture.spec.ts
      scripts/lib/reader-summary-promotion-v2-rollback-lifecycle-fixture.ts
      scripts/lib/reader-summary-promotion-v2-rollback-postgres-contract.ts
      scripts/lib/reader-summary-publication-postgres-publish.ts
      scripts/lib/reader-summary-publication-postgres-running-fixture.ts
      scripts/lib/reader-summary-quality-dashboard-collection-strategy.ts
      scripts/lib/reader-summary-quality-dashboard-feedback-shadow.ts
      scripts/lib/reader-summary-quality-dashboard-published-window.spec.ts
      scripts/lib/reader-summary-quality-dashboard-published-window.ts
      scripts/lib/reader-summary-quality-dashboard-report-builder.ts
      scripts/lib/reader-summary-quality-eval-support.spec.ts
      scripts/lib/reader-summary-quality-eval-support.ts
      scripts/lib/reader-summary-ready-delivery-postgres-fixture.ts
      scripts/lib/reader-summary-ready-recovery-postgres-fixture.ts
      scripts/lib/reader-summary-recovery-postgres-contract.ts
      scripts/lib/reader-summary-successor-fixture-migrations.ts
      scripts/lib/reader-summary-successor-fixture-observer.spec.ts
      scripts/lib/reader-summary-successor-fixture-observer.ts
      scripts/lib/reader-summary-successor-fixture-safety.ts
      scripts/lib/reader-summary-successor-fixture-seed.spec.ts
      scripts/lib/reader-summary-successor-fixture-seed.ts
      scripts/lib/reader-summary-successor-native-scenarios.ts
      scripts/lib/reader-summary-successor-native-support.ts
      scripts/lib/reader-summary-successor-publication-github.spec.ts
      scripts/lib/reader-summary-successor-publication-github.ts
      scripts/lib/reader-summary-v3-long-source-postgres-contract.ts
      scripts/lib/reader-summary-v3-migration-integration.spec.ts
      scripts/lib/reader-summary-v3-postgres-assessment-lifecycle.ts
      scripts/lib/reader-summary-v3-postgres-contract.ts
      scripts/lib/reader-summary-v3-postgres-preflight-client.ts
      scripts/lib/reader-summary-v3-postgres-preflight-fence.ts
      scripts/lib/reader-summary-v3-postgres-production-preflight.ts
      scripts/lib/reader-summary-weekly-atomic-publication-postgres-contract.ts
      scripts/lib/reader-summary-weekly-certification-seal-postgres-contract.ts
      scripts/lib/reader-summary-weekly-daily-certification-backfill-postgres-contract.ts
      scripts/lib/reader-summary-weekly-projection-postgres-contract.ts
      scripts/lib/reader-summary-weekly-publication-evidence-postgres-contract.ts
      scripts/lib/reader-summary-weekly-publication-github-fixture.ts
      scripts/lib/reader-summary-weekly-review-manifest-postgres-contract.ts
      scripts/lib/reader-value-assessment-publication-acl.ts
      scripts/lib/reader-value-postgres-fixture.ts
      scripts/lib/social-source-private-input-database.spec.ts
      scripts/lib/social-source-private-input-database.ts
      scripts/lib/yesterday-reader-summary-artifact-quality-store.spec.ts
      scripts/lib/yesterday-reader-summary-artifact-quality-store.ts
      scripts/lib/yesterday-replay-dispatch.spec.ts
      scripts/lib/yesterday-social-collection-quality-summary-counts.ts
      scripts/lib/yesterday-social-replay-support.ts
      scripts/prepare-reader-summary-successor-fixture.ts
      scripts/read-reader-summary-daily-terminal-set-receipt.spec.ts
      scripts/read-reader-summary-daily-terminal-set-receipt.ts
      scripts/reader-summary-publication-postgres-legacy.ts
      scripts/reader-summary-publication-postgres-privileges.ts
      scripts/reader-summary-publication-postgres-runtime-guard.ts
      scripts/reader-summary-publication-postgres18-regression.spec.ts
      scripts/reader-summary-publication-postgres18-regression.ts
      scripts/run-hn-rss-recovery.ts
      scripts/run-reader-promotion-v2-production-canary.ts
      scripts/run-reader-summary-clean-real-day-collection.ts
      scripts/run-reader-summary-promotion-v2-rollback.ts
      scripts/run-reader-summary-weekly-production.ts
      scripts/run-reader-summary-weekly-review-producer.ts
      test/feed-reader-summary-coverage-pool.integration.spec.ts
    `));
    for (const path of rawDependencyFiles) {
      expectRawDependencySyntax(path, readSource(path));
    }
  });

  it.each([
    "require(" + "'pg')",
    "import(" + "'pg')",
    "require(" + "'@prisma/adapter-pg')",
    "import * as bypass from " + "'pg'",
    'new pg.Pool({ min: 0, max: 1 })',
  ])('rejects an additional raw bypass in the exact constructor-spy spec: %s', (bypass) => {
    const path = 'scripts/lib/social-source-private-input-database.spec.ts';
    expect(() => expectRawDependencySyntax(path, `${readSource(path)}\n${bypass}`)).toThrow();
  });

  it('admits the genuine installed constructor spy and its type-only pool reference', () => {
    const path = 'scripts/lib/social-source-private-input-database.spec.ts';
    expect(() => expectRawDependencySyntax(path, readSource(path))).not.toThrow();
  });

  it('rejects fallible sibling setup before the constructor spy enters its finally', () => {
    const path = 'scripts/lib/social-source-private-input-database.spec.ts';
    expect(() => expectRawDependencySyntax(path, withFallibleSiblingSetup(readSource(path)))).toThrow();
  });

  it.each([false, true])('observes fake constructor restoration on setup failure (sibling=%s)', (sibling) => {
    const path = 'scripts/lib/social-source-private-input-database.spec.ts';
    const source = sibling ? withFallibleSiblingSetup(readSource(path)) : readSource(path);
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    let statement: ts.VariableStatement | undefined;
    const visit = (node: ts.Node): void => {
      if (ts.isVariableStatement(node) && node.declarationList.declarations.some(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'constructor',
      )) statement = node;
      ts.forEachChild(node, visit);
    };
    visit(file);
    if (!statement || !ts.isBlock(statement.parent)) throw new Error('Missing synthetic spy control');
    const cleanup = statement.parent.statements[statement.parent.statements.indexOf(statement) + 1];
    if (!cleanup || !ts.isTryStatement(cleanup) || !cleanup.finallyBlock) {
      throw new Error('Missing synthetic restoration control');
    }
    // Execute only the real declaration and finally against a fake export.
    // Ordinary setup throws inside try in the admitted shape, before try in its sibling variant.
    const body = `${statement.getText(file)}\ntry { setup(); } finally ${cleanup.finallyBlock.getText(file)}`;
    const constructorCalls = jest.fn();
    const original = () => { constructorCalls(); throw new Error('Synthetic constructor must stay unused'); };
    const pg = { Pool: original };
    const setup = jest.fn(() => { throw new Error('synthetic setup failure'); });
    try {
      expect(() => runInNewContext(ts.transpileModule(`(() => { ${body} })();`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText, {
        jest, pg, fake: { pool: {} }, on: jest.fn(), rows: [{}],
        databaseSnapshotReader: () => async () => [], setup,
      })).toThrow('synthetic setup failure');
      expect(pg.Pool === original).toBe(!sibling);
      expect(constructorCalls).not.toHaveBeenCalled();
      if (sibling) expect(pg.Pool).not.toHaveBeenCalled();
      expect(setup).toHaveBeenCalledTimes(sibling ? 0 : 1);
      let admitted = true;
      try { expectRawDependencySyntax(path, source); } catch { admitted = false; }
      // Admission must never approve a setup failure that leaves its spy installed.
      expect(admitted && pg.Pool !== original).toBe(false);
    } finally {
      if (pg.Pool !== original && jest.isMockFunction(pg.Pool)) pg.Pool.mockRestore();
    }
    expect(pg.Pool).toBe(original);
  });

  it('admits harmless constructor text and formatted genuine mock and restore calls', () => {
    const path = 'scripts/lib/social-source-private-input-database.spec.ts';
    const source = readSource(path)
      .replace("jest.spyOn(pg, 'Pool').mockImplementation(", "jest.spyOn( pg, 'Pool' )\n.mockImplementation(")
      .replace('finally { constructor.mockRestore(); }', 'finally {\n constructor.mockRestore();\n }');
    expect(() => expectRawDependencySyntax(path, `${source}\nconst note = 'new pg.Pool({max:100})';`)).not.toThrow();
  });

  it.each(['pg', 'Pg'].flatMap((namespace) => ['Pool', 'Client'].flatMap((member) => [
    { behavior: `${namespace}.${member} direct construction`, code: `new ${namespace}.${member}({ min: 0, max: 100 });` },
    { behavior: `${namespace}.${member} constructor alias`, code: `const Unbudgeted = ${namespace}.${member}; new Unbudgeted({ min: 0, max: 100 });` },
    { behavior: `${namespace}.${member} computed construction`, code: `new ${namespace}['${member}']({ min: 0, max: 100 });` },
    { behavior: `${namespace}.${member} dynamic computed construction`, code: `const key = '${member}'; new ${namespace}[key]({ min: 0, max: 100 });` },
    { behavior: `${namespace}.${member} destructured constructor`, code: `const { ${member} } = ${namespace}; new ${member}({ min: 0, max: 100 });` },
    { behavior: `${namespace}.${member} renamed destructured constructor`, code: `const { ${member}: Unbudgeted } = ${namespace}; new Unbudgeted({ min: 0, max: 100 });` },
  ])))('rejects untracked $behavior through the public raw dependency guard', ({ code }) => {
    const path = 'scripts/lib/social-source-private-input-database.spec.ts';
    expect(() => expectRawDependencySyntax(path, `${readSource(path)}\n${code}`)).toThrow();
  });

  it.each([
    ['namespace alias', 'const other = pg; new other.Pool({ min: 0, max: 100 });'],
    ['namespace destructuring', 'const { ...other } = pg;'],
    ['namespace spread', 'const other = { ...pg };'],
    ['argument escape', 'consume(pg);'],
    ['export escape', 'export { pg };'],
    ['namespace reassignment', 'pg = replacement;'],
    ['member reassignment', 'pg.Pool = replacement;'],
    ['reflective construction', "Reflect.construct(pg['Client'], [{ min: 0, max: 100 }]);"],
    ['optional member alias', 'const other = pg?.Pool;'],
    ['shorthand escape', 'const other = { pg };'],
    ['nested alias', 'function later() { return pg.Pool; }'],
    ['parenthesized alias', 'const other = (pg as unknown as any).Pool;'],
    ['escaped identifier alias', 'const other = p\\u0067.Pool;'],
    ['interpolated namespace', 'const other = `${pg}`;'],
    ['duplicate spy', "const another = jest.spyOn(pg, 'Pool').mockImplementation(() => fake);"],
    ['Jest shadow', 'function bypass(jest: any) { return jest; }'],
    ['Jest replacement', 'jest.spyOn = replacement;'],
    ['constructor spy reassignment', 'constructor = replacement;'],
    ['constructor spy escape', 'consume(constructor);'],
    ['malformed input', 'const other = pg[;'],
  ])('rejects %s through the public raw dependency guard', (_behavior, code) => {
    const path = 'scripts/lib/social-source-private-input-database.spec.ts';
    expect(() => expectRawDependencySyntax(path, `${readSource(path)}\n${code}`)).toThrow();
  });

  it.each([
    ['mock marker in a comment', (source: string) => source.replace("jest.spyOn(pg, 'Pool').mockImplementation(",
      "/* jest.spyOn(pg, 'Pool').mockImplementation( */ jest.spyOn(pg, 'Pool').mockReturnValue(")],
    ['restore marker in a comment', (source: string) => source.replace('finally { constructor.mockRestore(); }',
      'finally { /* finally { constructor.mockRestore(); } */ }')],
    ['wrong restore receiver', (source: string) => source.replace('finally { constructor.mockRestore(); }',
      'finally { other.mockRestore(); /* finally { constructor.mockRestore(); } */ }')],
    ['restore outside finally', (source: string) => source.replace('finally { constructor.mockRestore(); }',
      'finally {} constructor.mockRestore(); /* finally { constructor.mockRestore(); } */')],
    ['wrong spy member', (source: string) => source.replace("spyOn(pg, 'Pool')", "spyOn(pg, 'Client')")],
    ['namespace type import made live', (source: string) => source.replace('import type * as Pg', 'import * as Pg')],
    ['missing namespace type import', (source: string) => source.replace("import type * as Pg from " + "'pg';", '')],
    ['duplicate binding', (source: string) => `${source}\nconst pg = require(` + "'pg') as typeof Pg;"],
  ])('rejects %s instead of trusting textual spy markers', (_behavior, mutate) => {
    const path = 'scripts/lib/social-source-private-input-database.spec.ts';
    expect(() => expectRawDependencySyntax(path, mutate(readSource(path)))).toThrow();
  });

  it('refuses the genuine spy binding at any other path', () => {
    const source = readSource('scripts/lib/social-source-private-input-database.spec.ts');
    expect(() => expectRawDependencySyntax('scripts/unadmitted.spec.ts', source)).toThrow();
  });

  it('requires explicit min=0 and max on every direct pool outside the shared factory', () => {
    const directPoolFiles = completeDatabaseSourceFiles.filter(
      (path) => directPoolOptions(readSource(path)).length > 0,
    );

    for (const path of directPoolFiles) {
      if (boundedPostgresTestOnlyFiles.has(path)) {
        continue;
      }
      const options = directPoolOptions(readSource(path));
      expect(options.length).toBeGreaterThan(0);
      for (const option of options) {
        if (path.endsWith('postgres-runtime-pool-concurrency.spec.ts')) {
          expect(option).toContain('...poolConfig');
        } else {
          expect(option).toMatch(/\bmin:\s*0\b/);
          expect(option).toMatch(/\bmax:\s*[12]\b/);
        }
      }
    }
  });

  it('requires every production composition root to await bounded construction', () => {
    const productionConstructionSites = productionSourceFiles.filter((path) =>
      /Prisma[A-Za-z]+Connection\.create\s*\(/.test(readSource(path)),
    );

    expect(productionConstructionSites).toHaveLength(13);
    for (const path of productionConstructionSites) {
      const source = readSource(path);
      expect(source).toContain('resolvePostgresRuntimePoolConfig(process.env)');
      expect(source).toMatch(/useFactory:\s*async|useFactory:\s*\([^)]*\)\s*=>/s);
    }
  });

  it('keeps every direct script and seed pool at two connections or fewer', () => {
    const scriptSources = [
      ...runtimeSourceFiles('scripts').filter(
        (path) => !boundedPostgresTestOnlyFiles.has(path),
      ),
      'prisma/seed.ts',
    ].map(readSource);
    const scriptPoolOptions = scriptSources.flatMap(directPoolOptions);

    expect(scriptPoolOptions.length).toBeGreaterThan(0);
    for (const options of scriptPoolOptions) {
      expect(options).toMatch(/\bmin:\s*0\b/);
      expect(options).toMatch(/\bmax:\s*[12]\b/);
    }
  });

  it('keeps seed cleanup ordered and guarantees pool end after disconnect failure', () => {
    const seed = readSource('prisma/seed.ts');
    const cleanup = seed.slice(seed.indexOf('async function run()'));

    expect(seed).toContain('min: 0, max: 1');
    expect(seed).toContain('disposeExternalPool: false');
    expect(cleanup.indexOf('await prisma.$disconnect()')).toBeLessThan(
      cleanup.indexOf('await pool.end()'),
    );
    expect(cleanup).toMatch(
      /try \{\s*await prisma\.\$disconnect\(\);[\s\S]*?catch[\s\S]*?try \{\s*await pool\.end\(\);/,
    );
    expect(cleanup).not.toContain('process.exit(1)');
  });

  it('keeps one admitted manual or daily script process within the declared three-connection group', () => {
    for (const path of runtimeSourceFiles('scripts')) {
      if (boundedPostgresTestOnlyFiles.has(path)) {
        continue;
      }
      const source = readSource(path);
      const directMaximum = directPoolOptions(source)
        .map((options) => Number(/\bmax:\s*([12])\b/.exec(options)?.[1] ?? 0))
        .reduce((total, maximum) => total + maximum, 0);
      const sharedRuntimeMaximum = Math.max(
        0,
        ...Array.from(
          source.matchAll(
            /(?:defaultPostgresRuntimePoolConfig|createForProcess)\([\s\S]{0,200}?["'](daily-runner|api-gateway|admin-tool)["']/g,
          ),
          (match) =>
            POSTGRES_RUNTIME_POOL_LIMITS[
              match[1] as keyof typeof POSTGRES_RUNTIME_POOL_LIMITS
            ],
        ),
      );

      expect(directMaximum + sharedRuntimeMaximum).toBeLessThanOrEqual(3);
    }
  });

  it('keeps bounded PostgreSQL test harnesses test-only and explicit', () => {
    for (const [
      path,
      expectedMaximums,
    ] of BOUNDED_POSTGRES_TEST_POOL_MAXIMUMS) {
      const maximums = directPoolOptions(readSource(path)).map((options) =>
        Number(/\bmax:\s*([124])\b/.exec(options)?.[1] ?? 0),
      );
      expect(maximums).toEqual(expectedMaximums);
    }

    const productionImporters = completeDatabaseSourceFiles
      .filter((path) => !boundedPostgresTestOnlyFiles.has(path))
      .filter(
        (path) =>
          path !==
          'libs/platform/persistence/src/postgres-runtime-pool-budget.spec.ts',
      )
      .filter((path) =>
        /reader-summary-publication-postgres-(?:legacy|privileges|runtime-guard)/.test(
          readSource(path),
        ),
      );
    // The disposable successor bootstrap reuses protected-role provisioning.
    // Keep this exact importer inventoried without exempting its pool caps.
    // The callback spec isolates mocked privilege helpers without constructing pools.
    expect(productionImporters).toEqual([
      'scripts/check-reader-summary-publication-postgres.spec.ts',
      'scripts/lib/reader-summary-successor-fixture-migrations.ts',
    ]);
    expect(readSource('package.json')).toContain(
      'check:reader-summary-publication-postgres',
    );
  });
  it('keeps the production daily dispatcher sequential and within its budget', () => {
    const dispatcher = readSource(
      'scripts/run-reader-summary-production-day.ts',
    );
    const scopeReader = readSource(
      'scripts/lib/reader-summary-production-day-scope.ts',
    );
    const main = dispatcher.slice(dispatcher.indexOf('async function main()'));
    const scopeIndex = main.indexOf('await readProductionDayScope({');
    expect(dispatcher).toContain('import { spawnSync }');
    expect(dispatcher).not.toMatch(/runNpm\(\s*["']migrate["']/);
    expect(scopeIndex).toBeGreaterThanOrEqual(0);
    expect(scopeReader).toMatch(/new Pool\(\{[\s\S]*?max: 1/);
    expect(scopeReader).toContain('await pool.end()');
    for (const path of [
      'scripts/run-reader-summary-clean-real-day-collection.ts',
      'scripts/capture-durable-reader-summary-from-postgres.ts',
      'scripts/check-reader-summary-source-quality-trace.ts',
    ]) {
      const source = readSource(path);
      const usesDefaultBudget =
        /defaultPostgresRuntimePoolConfig\([\s\S]*?["']daily-runner["']\s*,?\s*\)/.test(
          source,
        );
      const usesValidatedRuntimeBudget =
        /resolvePostgresRuntimePoolConfig\(\{[\s\S]*?POSTGRES_RUNTIME_PROCESS:\s*["']daily-runner["']/.test(
          source,
        );
      expect(usesDefaultBudget || usesValidatedRuntimeBudget).toBe(true);
    }
  });

  it('matches the image dispatcher, base Compose, and production deploy inventory', () => {
    const dockerfile = readSource('Dockerfile');
    const dockerServices = Array.from(
      dockerfile.matchAll(
        /([a-z-]+)\) exec node dist\/apps\/([a-z-]+)\/src\/main\.js/g,
      ),
      (match) => [match[1], match[2]],
    );
    expect(dockerServices).toEqual([
      ['api', 'api-gateway'],
      ['agent-runtime', 'agent-runtime'],
      ['ingestion', 'ingestion-worker'],
      ['intelligence', 'intelligence-worker'],
      ['delivery', 'delivery-service'],
      ['event-relay', 'event-relay'],
    ]);

    const compose = readSource('docker-compose.yml');
    for (const service of [
      'api',
      'ingestion-worker',
      'intelligence-worker',
      'delivery-service',
      'event-relay',
      'agent-runtime',
      'migrate',
    ]) {
      expect(compose).toMatch(new RegExp(`^  ${service}:$`, 'm'));
    }
    for (const runtime of PRODUCTION_POSTGRES_RUNTIME_INVENTORY.filter(
      (candidate) => candidate.lifecycle === 'persistent',
    )) {
      const service = runtime.composeService;
      expect(service).not.toBeNull();
      const serviceSource = readComposeService(compose, service as string);
      expect(serviceSource).toContain(
        `POSTGRES_RUNTIME_PROCESS: ${runtime.processId}`,
      );
      expect(serviceSource).toContain(
        `POSTGRES_RUNTIME_POOL_MIN: "${POSTGRES_RUNTIME_POOL_MINIMUM}"`,
      );
      expect(serviceSource).toContain(
        `POSTGRES_RUNTIME_POOL_MAX: "${runtime.poolMax}"`,
      );
      expect(serviceSource).toMatch(/deploy:\s*\n\s+replicas: 1/);
    }

    expect(compose).not.toContain('POSTGRES_PROVIDER_MAX_CONNECTIONS');
    expect(compose).not.toContain('POSTGRES_PROVIDER_REQUIRED_RESERVE');
    const productionPoolOverlay = readSource(
      'ops/deploy/production-runtime/compose.postgres-runtime.yml',
    );
    const dailyRunner = readComposeService(
      productionPoolOverlay,
      'daily-runner',
    );
    expect(dailyRunner).toContain('POSTGRES_RUNTIME_PROCESS: daily-runner');
    expect(dailyRunner).toContain('POSTGRES_RUNTIME_POOL_MIN: "0"');
    expect(dailyRunner).toContain('POSTGRES_RUNTIME_POOL_MAX: "2"');
    expect(dailyRunner).toMatch(/deploy:\s*\n\s+replicas: 1/);

    const deploy = readSource('ops/deploy/social-monitor-production-deploy.sh');
    const composeScopeChecker = readSource(
      'ops/deploy/production-compose-scope-check.py',
    );
    const serviceAllowlist = composeScopeChecker.match(/expected_services = \{([^}]+)\}/)?.[1];
    for (const externallyComposedService of ['daily-runner', 'x-collector']) {
      expect(serviceAllowlist).toContain(`"${externallyComposedService}"`);
    }
    expect(composeScopeChecker).toContain('if set(services) != expected_services:');
    expect(deploy).toContain(
      'local scope_checker=$REPO/ops/deploy/production-compose-scope-check.py',
    );
    expect(deploy).toContain('python3 "$scope_checker" \\');
    expect(deploy).toContain('"$rendered" "$ROOT" "$REPO" "$CONTROL"');
    expect(deploy).toContain('exec 8>"$POSTGRES_ADMISSION_LOCK"');
    expect(deploy).toContain(
      'acquire_postgres_admission_with_daily_priority 8',
    );
    const deployControl = readSource('ops/deploy/deploy-control-lib.sh');
    expect(deployControl).toContain('probe_daily_singleton_clear');
    expect(deployControl).toContain('flock -n "$admission_fd"');
    expect(deployControl).toContain('flock -u "$admission_fd"');
    expect(deploy).toContain(
      'activate_postgres_runtime_control "$sha" "$compatible_backend_sha"',
    );
    const productionDaily = readSource(
      'ops/deploy/production-runtime/daily-run.sh',
    );
    expect(productionDaily).toContain('control/daily-run-singleton.lock');
    expect(productionDaily).toContain('control/daily-run.lock');
    expect(productionDaily).toContain(
      'POSTGRES_ADMISSION_WAIT_SECONDS=7500',
    );
    const productionDailyUnit = readSource(
      'ops/deploy/production-runtime/social-monitor-daily.service',
    );
    expect(productionDailyUnit).toContain('TimeoutStartSec=19800');
    expect(productionDailyUnit).toContain('Restart=no');
    expect(deploy).toContain(
      'verify_live_postgres_admission "$postgres_env"',
    );
    expect(deploy).toContain('verify-postgres-runtime-topology.py');
    const deployBackend = deploy.slice(deploy.indexOf('deploy_backend()'));
    expect(deployBackend.indexOf('backup_database "$sha"')).toBeLessThan(
      deployBackend.indexOf('deploy_reader_summary_publication_migrations'),
    );
    expect(
      deployBackend.indexOf('deploy_reader_summary_publication_migrations'),
    ).toBeLessThan(
      deployBackend.indexOf('up -d --no-deps --force-recreate'),
    );
    const publicationDeploy = readSource(
      'ops/deploy/reader-summary-publication-deploy-lib.sh',
    );
    expect(
      publicationDeploy.indexOf(
        '"$secret" "$ca_certificate" "$runtime_role" pre',
      ),
    ).toBeLessThan(publicationDeploy.indexOf('npm run migrate:deploy'));
    expect(publicationDeploy.indexOf('npm run migrate:deploy')).toBeLessThan(
      publicationDeploy.indexOf(
        '"$secret" "$ca_certificate" "$runtime_role" post',
      ),
    );
    expect(
      deployBackend.indexOf(
        'stop_and_remove_database_services "${persistent[@]}"',
      ),
    ).toBeLessThan(
      deployBackend.indexOf('up -d --no-deps --force-recreate'),
    );
  });

  it('binds every database entrypoint to its declared process identity', () => {
    for (const runtime of PRODUCTION_POSTGRES_RUNTIME_INVENTORY.filter(
      (candidate) =>
        candidate.lifecycle === 'persistent' ||
        candidate.lifecycle === 'optional',
    )) {
      expect(readSource(runtime.entrypoint)).toContain(
        `bindPostgresRuntimeProcessIdentity(process.env, '${runtime.processId}')`,
      );
    }
  });

  it('keeps worker drain hooks in an earlier Nest phase than database cleanup', () => {
    const workerDrainFiles = [
      'apps/ingestion-worker/src/scan-queue-drain-loop.ts',
      'apps/ingestion-worker/src/scan-scheduler-loop.ts',
      'apps/intelligence-worker/src/summary-job-polling-loop.ts',
      'apps/intelligence-worker/src/reader-summary-job-polling-loop.ts',
      'apps/intelligence-worker/src/summary-job-queue-drain-loop.ts',
      'apps/intelligence-worker/src/reader-summary-job-queue-drain-loop.ts',
      'apps/intelligence-worker/src/auto-summary-scheduler-loop.ts',
      'apps/intelligence-worker/src/periodic-reader-summary-scheduler-loop.ts',
      'apps/intelligence-worker/src/relevance-memory-projection-loop.ts',
      'apps/delivery-service/src/delivery-attempt-dispatch-loop.ts',
      'apps/delivery-service/src/delivery-attempt-queue-drain-loop.ts',
      'apps/delivery-service/src/digest-scheduler-loop.ts',
      'apps/delivery-service/src/summary-ready-event-drain-loop.ts',
      'apps/event-relay/src/outbox-relay-loop.ts',
    ];
    for (const path of workerDrainFiles) {
      expect(readSource(path)).toContain('onModuleDestroy(');
    }
    for (const path of [
      'apps/ingestion-worker/src/scan-queue-drain-loop.ts',
      'apps/intelligence-worker/src/summary-job-queue-drain-loop.ts',
      'apps/intelligence-worker/src/reader-summary-job-queue-drain-loop.ts',
      'apps/delivery-service/src/delivery-attempt-queue-drain-loop.ts',
      'apps/delivery-service/src/summary-ready-event-drain-loop.ts',
    ]) {
      const source = readSource(path);
      expect(source).toContain('delivery.nack({ requeue: true })');
      expect(source).toContain('operation.backpressure');
    }
    for (const path of Object.values(POSTGRES_RUNTIME_CONNECTION_FACTORIES)) {
      const source = readSource(path);
      expect(source).toContain('onApplicationShutdown(');
      expect(source).not.toContain('onModuleDestroy(');
    }
    const workerRuntime = readSource('libs/platform/worker/src/worker-runtime.ts');
    expect(workerRuntime).not.toContain('onModuleDestroy(');
    expect(workerRuntime).toContain('beforeApplicationShutdown(');
    expect(workerRuntime).toMatch(
      /onApplicationShutdown[\s\S]*?return this\.beforeApplicationShutdown\(signal\)/,
    );
  });

  it('handles optional runtime close rejections at signal entrypoints', () => {
    const grpcMain = readSource('apps/social-research-grpc/src/main.ts');
    const mcpMain = readSource('apps/social-research-mcp/src/main.ts');
    expect(grpcMain).toMatch(/runtime\s*\.close\(\)\s*\.catch\(/s);
    expect(mcpMain).toMatch(/runtime\.close\(\)\.catch\(/s);
  });
});
