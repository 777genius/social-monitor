import { existsSync, readFileSync } from 'node:fs';

const matrixPath = 'ops/security/production-auth-matrix.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';

const matrix = readJson(matrixPath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const openApi = readJson(matrix.openApiSnapshot);
const scripts = packageJson.scripts ?? {};
const violations = [];

const requiredSurfaces = new Set([
  'topics',
  'source-bindings',
  'source-credentials',
  'scans',
  'feed',
  'summaries',
  'feedback',
  'delivery',
  'audit',
  'api-keys',
]);
const requiredNegativeCases = new Set([
  'wrong-tenant',
  'wrong-workspace',
  'wrong-workspace-api-key',
  'expired-jwt',
  'wrong-audience',
  'missing-durable-membership',
  'dev-role-header-ignored-in-beta',
  'read-scope-matrix',
  'write-scope-matrix',
  'reader-surface-tenant-isolation',
]);
const allowedRoles = new Set(['owner', 'admin', 'member', 'viewer']);
const allowedAuthModes = new Set(['bearer-oidc-jwt', 'workspace-role-dev-test']);
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const allowedApiKeyScopes = new Set([
  'read:delivery_status',
  'read:feed',
  'read:summaries',
  'read:topics',
  'read:webhook_endpoints',
  'write:delivery_status',
  'write:scan_requests',
  'write:source_bindings',
  'write:summaries',
  'write:topics',
  'write:webhook_endpoints',
]);

if (matrix.schemaVersion !== 1) {
  violations.push(`${matrixPath}: schemaVersion must be 1`);
}

if (matrix.scope !== 'backend-only') {
  violations.push(`${matrixPath}: scope must be backend-only`);
}

if (matrix.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${matrixPath}: frontendPolicy must keep frontend deferred`);
}

if (!existsSync(matrix.openApiSnapshot)) {
  violations.push(`${matrixPath}: openApiSnapshot must exist`);
}

const publicOperationKeys = new Set();
for (const operation of matrix.publicOperations ?? []) {
  requireOperationShape(operation, 'publicOperations');
  publicOperationKeys.add(operationKey(operation));
  if (!safeMethods.has(operation.method)) {
    violations.push(`${matrixPath}: public operation ${operationKey(operation)} must use a safe HTTP method`);
  }
  if (operation.path.includes('{') || operation.path.includes('}')) {
    violations.push(`${matrixPath}: public operation ${operationKey(operation)} must not expose path parameters`);
  }
  if (typeof operation.reason !== 'string' || operation.reason.trim().length === 0) {
    violations.push(`${matrixPath}: public operation ${operationKey(operation)} must define reason`);
  }
}

const matrixOperationKeys = new Set();
const surfaceIds = new Set();
for (const surface of matrix.surfaces ?? []) {
  if (surfaceIds.has(surface.surfaceId)) {
    violations.push(`${matrixPath}: duplicate surfaceId "${surface.surfaceId}"`);
  }
  surfaceIds.add(surface.surfaceId);

  if (!requiredSurfaces.has(surface.surfaceId)) {
    violations.push(`${matrixPath}: unsupported surfaceId "${surface.surfaceId}"`);
  }

  if (!Array.isArray(surface.evidenceFiles) || surface.evidenceFiles.length === 0) {
    violations.push(`${matrixPath}: surface "${surface.surfaceId}" must list evidenceFiles`);
  }
  for (const file of surface.evidenceFiles ?? []) {
    if (!existsSync(file)) {
      violations.push(`${matrixPath}: surface "${surface.surfaceId}" references missing evidence file "${file}"`);
    }
  }

  if (!Array.isArray(surface.operations) || surface.operations.length === 0) {
    violations.push(`${matrixPath}: surface "${surface.surfaceId}" must list operations`);
  }
  for (const operation of surface.operations ?? []) {
    requireOperationShape(operation, `surface ${surface.surfaceId}`);
    const key = operationKey(operation);
    if (matrixOperationKeys.has(key)) {
      violations.push(`${matrixPath}: duplicate protected operation "${key}"`);
    }
    matrixOperationKeys.add(key);

    if (typeof operation.action !== 'string' || operation.action.trim().length === 0) {
      violations.push(`${matrixPath}: protected operation "${key}" must define action`);
    }
    if (!Array.isArray(operation.roles) || operation.roles.length === 0) {
      violations.push(`${matrixPath}: protected operation "${key}" must define allowed roles`);
    } else {
      for (const role of operation.roles) {
        if (!allowedRoles.has(role)) {
          violations.push(`${matrixPath}: protected operation "${key}" declares unsupported role "${role}"`);
        }
      }
    }
    if (operation.apiKeyScope !== undefined && !allowedApiKeyScopes.has(operation.apiKeyScope)) {
      violations.push(`${matrixPath}: protected operation "${key}" declares unsupported apiKeyScope "${operation.apiKeyScope}"`);
    }
    if (operation.apiKeyScope !== undefined) {
      validateApiKeyScopeSemantics(operation, key);
    }
    if (operation.apiKeyScope === undefined) {
      const authModes = new Set(operation.authModes ?? []);
      for (const authMode of authModes) {
        if (!allowedAuthModes.has(authMode)) {
          violations.push(`${matrixPath}: protected operation "${key}" declares unsupported authMode "${authMode}"`);
        }
      }
      if (!authModes.has('bearer-oidc-jwt') || !authModes.has('workspace-role-dev-test')) {
        violations.push(`${matrixPath}: protected operation "${key}" without apiKeyScope must declare JWT and dev role authModes`);
      }
      validateAdminOnlyJwtOperation(operation, key);
    }
  }
}

for (const surfaceId of requiredSurfaces) {
  if (!surfaceIds.has(surfaceId)) {
    violations.push(`${matrixPath}: missing required surface "${surfaceId}"`);
  }
}

const openApiOperationKeys = new Set();
for (const [path, methods] of Object.entries(openApi.paths ?? {})) {
  for (const method of Object.keys(methods)) {
    openApiOperationKeys.add(`${method.toUpperCase()} ${path}`);
  }
}

for (const key of publicOperationKeys) {
  if (!openApiOperationKeys.has(key)) {
    violations.push(`${matrixPath}: public operation "${key}" is not present in OpenAPI snapshot`);
  }
}

for (const key of matrixOperationKeys) {
  if (!openApiOperationKeys.has(key)) {
    violations.push(`${matrixPath}: protected operation "${key}" is not present in OpenAPI snapshot`);
  }
}

for (const key of openApiOperationKeys) {
  if (!publicOperationKeys.has(key) && !matrixOperationKeys.has(key)) {
    violations.push(`${matrixPath}: OpenAPI operation "${key}" is missing from production auth matrix`);
  }
}

const negativeCaseIds = new Set();
for (const negativeCase of matrix.globalNegativeCases ?? []) {
  if (negativeCaseIds.has(negativeCase.caseId)) {
    violations.push(`${matrixPath}: duplicate negative case "${negativeCase.caseId}"`);
  }
  negativeCaseIds.add(negativeCase.caseId);

  if (!requiredNegativeCases.has(negativeCase.caseId)) {
    violations.push(`${matrixPath}: unsupported negative case "${negativeCase.caseId}"`);
  }
  if (!existsSync(negativeCase.evidenceFile)) {
    violations.push(`${matrixPath}: negative case "${negativeCase.caseId}" references missing evidence file "${negativeCase.evidenceFile}"`);
    continue;
  }

  const evidence = readFileSync(negativeCase.evidenceFile, 'utf8');
  if (!evidence.includes(negativeCase.requiredSnippet)) {
    violations.push(`${matrixPath}: negative case "${negativeCase.caseId}" evidence must include "${negativeCase.requiredSnippet}"`);
  }
}

for (const caseId of requiredNegativeCases) {
  if (!negativeCaseIds.has(caseId)) {
    violations.push(`${matrixPath}: missing required negative case "${caseId}"`);
  }
}

const backendScripts = new Set(backendSafe.backendScripts ?? []);
const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
const authDomain = (backendOps.requiredDomains ?? []).find((domain) => domain.domainId === 'auth-boundary');

if (!scripts['check:production-auth-matrix']) {
  violations.push(`${packagePath}: missing check:production-auth-matrix`);
}
if (!backendScripts.has('check:production-auth-matrix')) {
  violations.push(`${backendSafePath}: backend-safe verify must include check:production-auth-matrix`);
}
if (!releaseGateIds.has('production-auth-matrix')) {
  violations.push(`${releaseContractPath}: missing production-auth-matrix release gate`);
}
if (!authDomain?.gates?.includes('check:production-auth-matrix')) {
  violations.push(`${backendOpsPath}: auth-boundary domain must include check:production-auth-matrix`);
}
if (!authDomain?.releaseGateIds?.includes('production-auth-matrix')) {
  violations.push(`${backendOpsPath}: auth-boundary domain must include production-auth-matrix release gate`);
}
if (!authDomain?.artifacts?.includes(matrixPath)) {
  violations.push(`${backendOpsPath}: auth-boundary domain must include ${matrixPath}`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log(`Production auth matrix OK (${matrixOperationKeys.size} protected operations)`);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function requireOperationShape(operation, label) {
  if (typeof operation.method !== 'string' || operation.method.toUpperCase() !== operation.method) {
    violations.push(`${matrixPath}: ${label} operation must define uppercase method`);
  }
  if (typeof operation.path !== 'string' || !operation.path.startsWith('/')) {
    violations.push(`${matrixPath}: ${label} operation must define absolute path`);
  }
}

function validateApiKeyScopeSemantics(operation, key) {
  const expectedPrefix = safeMethods.has(operation.method) ? 'read:' : 'write:';
  if (!operation.apiKeyScope.startsWith(expectedPrefix)) {
    violations.push(`${matrixPath}: protected operation "${key}" must use ${expectedPrefix} apiKeyScope`);
  }
}

function validateAdminOnlyJwtOperation(operation, key) {
  const roles = new Set(operation.roles ?? []);
  for (const role of roles) {
    if (role !== 'owner' && role !== 'admin') {
      violations.push(`${matrixPath}: protected JWT/dev-only operation "${key}" must stay owner/admin only`);
    }
  }
}

function operationKey(operation) {
  return `${operation.method} ${operation.path}`;
}
