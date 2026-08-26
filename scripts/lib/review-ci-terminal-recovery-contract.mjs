import ts from "typescript";

export const terminalAuthorityPostgres18Command =
  "node scripts/run-with-timeout.mjs --timeout-ms 180000 --node-options --max-old-space-size=1024 -- ts-node -r tsconfig-paths/register scripts/check-reader-summary-daily-terminal-authority-postgres.ts";

const recoveryName = "runReaderSummaryTelemetryMigrationRecoveryPostgres18";
const recoveryModule = "./lib/reader-summary-telemetry-migration-recovery-postgres";
const releaseName = "runReaderSummaryDailyTelemetryRelease";
const releaseModule = "./lib/reader-summary-daily-telemetry-release";
const exactReleaseImports = [
  "assertReaderSummaryDailyTelemetryReleaseDatabaseState",
  releaseName,
];
const exactRecoveryArguments = [
  "adminDatabaseUrl", "defaultAclMigration", "workspace",
];
const exactReleaseStages = [
  "preparePreTelemetryRelease", "verifyPreTelemetryAuthority",
  "applyTelemetryMigration", "hardenPostTelemetryRelease",
  "verifyFinalReleaseState",
];

export const terminalAuthorityCommandViolations = (packageJson) =>
  packageJson.scripts?.["check:reader-summary-daily-terminal-authority-postgres"] ===
    terminalAuthorityPostgres18Command
    ? []
    : [
      "package.json: daily terminal PostgreSQL 18 checker must remain the exact timeout-bounded reviewed command",
    ];

export const terminalRecoveryWiringViolations = (source, releaseSource) => {
  const violations = [];
  const file = parse(source, "terminal-authority.ts");
  if (file.parseDiagnostics.length !== 0) {
    return ["terminal PostgreSQL 18 checker must remain syntactically canonical"];
  }
  const imports = file.statements.filter((statement) =>
    ts.isImportDeclaration(statement) &&
    stringValue(statement.moduleSpecifier) === recoveryModule
  );
  if (imports.length !== 1 || !isExactNamedImport(imports[0], recoveryName)) {
    violations.push(
      "terminal PostgreSQL 18 checker must use one unaliased exact telemetry recovery import",
    );
  }
  const releaseImports = file.statements.filter((statement) =>
    ts.isImportDeclaration(statement) &&
    stringValue(statement.moduleSpecifier) === releaseModule
  );
  if (releaseImports.length !== 1 ||
      !isExactNamedImports(releaseImports[0], exactReleaseImports)) {
    violations.push(
      "terminal PostgreSQL 18 checker must use the exact unaliased release-runner module import",
    );
  }
  const calls = descendants(file).filter((node) =>
    ts.isCallExpression(node) && identifier(node.expression) === recoveryName
  );
  if (identifierCount(file, recoveryName) !== 2 || calls.length !== 1 ||
      !isExactRecoveryCall(calls[0])) {
    violations.push(
      "terminal PostgreSQL 18 checker must unconditionally await one exact telemetry recovery call with reviewed arguments",
    );
  }
  const releaseCalls = descendants(file).filter((node) =>
    ts.isCallExpression(node) && identifier(node.expression) === releaseName
  );
  if (identifierCount(file, releaseName) !== 2 || releaseCalls.length !== 1 ||
      !isExactReleaseCall(releaseCalls[0])) {
    violations.push(
      "terminal PostgreSQL 18 checker must unconditionally await one release runner call with the exact stage arguments",
    );
  }
  if (releaseCalls.length === 1 && hasEarlierAbruptExit(file, releaseCalls[0])) {
    violations.push(
      "terminal PostgreSQL 18 release call must be reachable on every earlier main path",
    );
  }
  const mainCalls = descendants(file).filter((node) =>
    ts.isCallExpression(node) && identifier(node.expression) === "main"
  );
  if (identifierCount(file, "main") !== 2 || mainCalls.length !== 1 ||
      !isExactMainEntrypoint(mainCalls[0])) {
    violations.push(
      "terminal PostgreSQL 18 checker must invoke main once from the unconditional top level",
    );
  }
  if (releaseSource === undefined ||
      releaseOrderViolations(releaseSource).length !== 0) {
    violations.push(
      "daily telemetry release runner must retain the exact unconditional stage order",
    );
  }
  return violations;
};

export const terminalPostgres18JobViolations = (workflow) => {
  const violations = [];
  const trigger = exactIndentedBlock(workflow, "on:", 0);
  const job = exactIndentedBlock(
    workflow, "  reader_summary_weekly_review_manifest_postgres18:", 2,
  );
  if (trigger !== exactWorkflowTrigger || job !== exactTerminalJob ||
      /^(?:concurrency|defaults):/mu.test(workflow)) {
    violations.push(
      "review CI must define the unconditional exact PostgreSQL 18 terminal job",
    );
    return violations;
  }
  return violations;
};

const exactWorkflowTrigger = `on:
  pull_request:
  merge_group:
  workflow_dispatch:
`;

const exactTerminalJob = `  reader_summary_weekly_review_manifest_postgres18:
    name: Reader-summary weekly review manifest PostgreSQL 18
    runs-on: ubuntu-latest
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:18.4-alpine
        env:
          POSTGRES_USER: social_monitor_weekly_review_manifest_ci_admin
          POSTGRES_PASSWORD: social_monitor_local_password
          POSTGRES_DB: social_monitor_weekly_review_manifest_ci_admin
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U social_monitor_weekly_review_manifest_ci_admin -d social_monitor_weekly_review_manifest_ci_admin"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 20

    steps:
      - name: Check out the review commit
        uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10

      - name: Set up Node.js
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: 22
          cache: npm

      - name: Install exact dependencies
        run: npm ci

      - name: Generate the pinned Prisma client
        run: npm run prisma:generate

      - name: Prove weekly review manifest PostgreSQL 18 contract
        env:
          DATABASE_URL: postgresql://social_monitor_weekly_review_manifest_ci_admin:social_monitor_local_password@127.0.0.1:5432/social_monitor_weekly_review_manifest_ci_admin
          READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL: postgresql://social_monitor_weekly_review_manifest_ci_admin:social_monitor_local_password@127.0.0.1:5432/social_monitor_weekly_review_manifest_ci_admin
        run: |
          npm run check:reader-summary-daily-execution-cursor-postgres18
          npm run check:reader-summary-daily-terminal-authority-postgres
          npm run check:reader-summary-weekly-review-manifest-postgres18
          npm run check:reader-summary-recovery-candidate-staging-postgres
`;

const releaseOrderViolations = (source) => {
  const file = parse(source, "telemetry-release.ts");
  if (file.parseDiagnostics.length !== 0) return ["invalid release runner syntax"];
  const declarations = descendants(file).filter((node) =>
    ts.isVariableDeclaration(node) && identifier(node.name) === releaseName
  );
  if (declarations.length !== 1) return ["missing release runner"];
  const initializer = declarations[0].initializer;
  if (initializer === undefined || !ts.isArrowFunction(initializer) ||
      !ts.isBlock(initializer.body)) return ["noncanonical release runner"];
  const stages = initializer.body.statements.map((statement) => {
    if (!ts.isExpressionStatement(statement) ||
        !ts.isAwaitExpression(statement.expression) ||
        !ts.isCallExpression(statement.expression.expression)) return undefined;
    const expression = statement.expression.expression.expression;
    return ts.isPropertyAccessExpression(expression) &&
      identifier(expression.expression) === "operations"
      ? expression.name.text
      : undefined;
  });
  return JSON.stringify(stages) === JSON.stringify(exactReleaseStages)
    ? []
    : ["changed release order"];
};

const isExactRecoveryCall = (call) => {
  if (!ts.isAwaitExpression(call.parent) ||
      !ts.isExpressionStatement(call.parent.parent)) return false;
  const block = call.parent.parent.parent;
  if (!ts.isBlock(block) || block.statements.length !== 2 ||
      block.statements[1] !== call.parent.parent) return false;
  if (!isExactPreRecoveryBootstrap(block.statements[0])) return false;
  const arrow = block.parent;
  const property = arrow.parent;
  if (!ts.isArrowFunction(arrow) || !ts.isPropertyAssignment(property) ||
      identifier(property.name) !== "applyTelemetryMigration") return false;
  const releaseCall = property.parent.parent;
  if (!ts.isCallExpression(releaseCall) ||
      identifier(releaseCall.expression) !== releaseName ||
      releaseCall.arguments.length !== 1 || releaseCall.arguments[0] !== property.parent) {
    return false;
  }
  if (!ts.isAwaitExpression(releaseCall.parent) ||
      !ts.isExpressionStatement(releaseCall.parent.parent) ||
      !ts.isBlock(releaseCall.parent.parent.parent) ||
      !isUnconditionallyInMain(releaseCall.parent.parent)) return false;
  if (call.arguments.length !== 1 ||
      !ts.isObjectLiteralExpression(call.arguments[0])) return false;
  const names = call.arguments[0].properties.map((argument) =>
    ts.isShorthandPropertyAssignment(argument) ? argument.name.text : undefined
  );
  return JSON.stringify(names) === JSON.stringify(exactRecoveryArguments);
};

const isExactReleaseCall = (call) => {
  if (!ts.isAwaitExpression(call.parent) ||
      !ts.isExpressionStatement(call.parent.parent) ||
      !isUnconditionallyInMain(call.parent.parent) ||
      call.arguments.length !== 1 ||
      !ts.isObjectLiteralExpression(call.arguments[0])) return false;
  const properties = call.arguments[0].properties;
  const names = properties.map((property) =>
    ts.isPropertyAssignment(property) ? identifier(property.name) : undefined
  );
  return JSON.stringify(names) === JSON.stringify(exactReleaseStages) &&
    properties.every((property) => ts.isPropertyAssignment(property) &&
      ts.isArrowFunction(property.initializer));
};

const isExactPreRecoveryBootstrap = (statement) => {
  if (!ts.isExpressionStatement(statement) ||
      !ts.isAwaitExpression(statement.expression) ||
      !ts.isCallExpression(statement.expression.expression)) return false;
  const call = statement.expression.expression;
  const expression = call.expression;
  return ts.isPropertyAccessExpression(expression) &&
    identifier(expression.expression) === "privileges" &&
    expression.name.text === "runReaderSummaryPublicationBootstrapSql" &&
    call.arguments.length === 4 && stringValue(call.arguments[0]) === "pre" &&
    identifier(call.arguments[1]) === "adminDatabaseUrl" &&
    identifier(call.arguments[2]) === "runtimeRole" &&
    identifier(call.arguments[3]) === "systemRuntimeRole";
};

const hasEarlierAbruptExit = (file, releaseCall) => {
  const main = descendants(file).find((node) =>
    ts.isVariableDeclaration(node) && identifier(node.name) === "main"
  );
  const body = main?.initializer?.body;
  if (!body || !ts.isBlock(body)) return true;
  let abrupt = false;
  const visit = (node) => {
    if (abrupt || node.pos >= releaseCall.pos) return;
    if (node !== body && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node) ||
        ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
      abrupt = true;
      return;
    }
    if (ts.isCallExpression(node) && isProcessTerminationCall(node)) {
      abrupt = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return abrupt;
};

const isProcessTerminationCall = (call) => {
  const expression = call.expression;
  return ts.isPropertyAccessExpression(expression) &&
    identifier(expression.expression) === "process" &&
    ["abort", "exit", "kill", "reallyExit"].includes(expression.name.text);
};

const isUnconditionallyInMain = (statement) => {
  let node = statement;
  while (node.parent !== undefined) {
    const parent = node.parent;
    if (ts.isBlock(parent)) {
      node = parent;
      continue;
    }
    if (ts.isTryStatement(parent) && parent.tryBlock === node) {
      node = parent;
      continue;
    }
    if (ts.isArrowFunction(parent) && parent.body === node &&
        ts.isVariableDeclaration(parent.parent) &&
        identifier(parent.parent.name) === "main") {
      const declarationList = parent.parent.parent;
      const declarationStatement = declarationList.parent;
      return ts.isVariableDeclarationList(declarationList) &&
        ts.isVariableStatement(declarationStatement) &&
        ts.isSourceFile(declarationStatement.parent);
    }
    return false;
  }
  return false;
};

const isExactMainEntrypoint = (mainCall) => {
  const access = mainCall.parent;
  const catchCall = access.parent;
  const voidExpression = catchCall.parent;
  const statement = voidExpression.parent;
  return ts.isPropertyAccessExpression(access) && access.expression === mainCall &&
    access.name.text === "catch" && ts.isCallExpression(catchCall) &&
    catchCall.expression === access && catchCall.arguments.length === 1 &&
    ts.isArrowFunction(catchCall.arguments[0]) &&
    ts.isVoidExpression(voidExpression) && voidExpression.expression === catchCall &&
    ts.isExpressionStatement(statement) && ts.isSourceFile(statement.parent);
};

const isExactNamedImport = (statement, name) => {
  if (!ts.isImportDeclaration(statement)) return false;
  const bindings = statement.importClause?.namedBindings;
  return statement.importClause?.name === undefined &&
    bindings !== undefined && ts.isNamedImports(bindings) &&
    bindings.elements.length === 1 &&
    bindings.elements[0].propertyName === undefined &&
    bindings.elements[0].name.text === name;
};
const isExactNamedImports = (statement, names) => {
  if (!ts.isImportDeclaration(statement)) return false;
  const bindings = statement.importClause?.namedBindings;
  return statement.importClause?.name === undefined && bindings !== undefined &&
    ts.isNamedImports(bindings) && bindings.elements.length === names.length &&
    bindings.elements.every((element, index) =>
      element.propertyName === undefined && element.name.text === names[index]
    );
};

const parse = (source, name) => ts.createSourceFile(
  name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
);
const descendants = (root) => {
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return nodes;
};
const identifier = (node) => ts.isIdentifier(node) ? node.text : undefined;
const identifierCount = (root, name) => descendants(root).filter((node) =>
  ts.isIdentifier(node) && node.text === name
).length;
const stringValue = (node) => ts.isStringLiteral(node) ? node.text : undefined;

const exactIndentedBlock = (source, header, indent) => {
  const lines = source.split("\n");
  const indexes = lines.flatMap((line, index) => line === header ? [index] : []);
  if (indexes.length !== 1) return undefined;
  const end = lines.findIndex((line, index) => index > indexes[0] &&
    line.trim() !== "" && line.length - line.trimStart().length <= indent);
  return lines.slice(indexes[0], end < 0 ? lines.length : end).join("\n");
};
