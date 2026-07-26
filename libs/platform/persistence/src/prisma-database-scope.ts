import {
  currentDatabaseAccess,
  type DatabaseAccess,
  type TenantDatabaseAccess,
} from './database-access-context';

export type PrismaModelScope = 'shared' | 'tenant' | 'workspace';

const SHARED_MODELS = new Set([
  'capabilityProfile',
  'rateLimitBucket',
  'sourceCatalogEntry',
]);
const TENANT_ONLY_MODELS = new Set(['tenant', 'user', 'workspace']);

export const PRISMA_MODEL_OPERATIONS = new Set([
  'aggregate',
  'count',
  'create',
  'createMany',
  'createManyAndReturn',
  'delete',
  'deleteMany',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
]);

export const PRISMA_RAW_OPERATIONS = new Set([
  '$executeRaw',
  '$executeRawUnsafe',
  '$queryRaw',
  '$queryRawUnsafe',
]);

export function prismaModelScope(model: string): PrismaModelScope {
  if (SHARED_MODELS.has(model)) {
    return 'shared';
  }
  return TENANT_ONLY_MODELS.has(model) ? 'tenant' : 'workspace';
}

export function resolvePrismaDatabaseAccess(
  model: string,
  args: readonly unknown[],
): DatabaseAccess | undefined {
  const requirement = prismaModelScope(model);
  if (requirement === 'shared') {
    return currentDatabaseAccess();
  }

  const contextual = currentDatabaseAccess();
  const inferred = inferTenantAccess(args);
  if (contextual?.kind === 'system') {
    return contextual;
  }
  if (contextual?.kind === 'tenant') {
    assertCompatibleTenantAccess(contextual, inferred);
    return contextual;
  }
  if (inferred === undefined) {
    throw new Error(
      `Tenant database access is required for Prisma model ${model}`,
    );
  }
  if (requirement === 'workspace' && inferred.workspaceId.length === 0) {
    throw new Error(
      `Workspace database access is required for Prisma model ${model}`,
    );
  }
  return inferred;
}

export function assertSameDatabaseAccess(
  established: DatabaseAccess | undefined,
  requested: DatabaseAccess,
): DatabaseAccess {
  if (established === undefined) {
    return requested;
  }
  if (established.kind !== requested.kind) {
    throw new Error('A Prisma transaction cannot change database access mode');
  }
  if (
    established.kind === 'tenant' &&
    (established.tenantId !== (requested as TenantDatabaseAccess).tenantId ||
      established.workspaceId !==
        (requested as TenantDatabaseAccess).workspaceId)
  ) {
    throw new Error('A Prisma transaction cannot cross tenant scope');
  }
  return established;
}

function inferTenantAccess(values: readonly unknown[]): TenantDatabaseAccess | undefined {
  const tenantIds = new Set<string>();
  const workspaceIds = new Set<string>();
  for (const value of values) {
    collectScopeValues(value, tenantIds, workspaceIds, new Set());
  }
  if (tenantIds.size > 1 || workspaceIds.size > 1) {
    throw new Error('Prisma operation contains conflicting tenant scope');
  }
  const tenantId = first(tenantIds);
  if (tenantId === undefined) {
    return undefined;
  }
  return {
    kind: 'tenant',
    tenantId,
    workspaceId: first(workspaceIds) ?? '',
  };
}

function collectScopeValues(
  value: unknown,
  tenantIds: Set<string>,
  workspaceIds: Set<string>,
  visited: Set<object>,
): void {
  if (value === null || typeof value !== 'object' || visited.has(value)) {
    return;
  }
  visited.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectScopeValues(entry, tenantIds, workspaceIds, visited);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'tenantId' && typeof entry === 'string') {
      tenantIds.add(entry.trim().toLowerCase());
    } else if (key === 'workspaceId' && typeof entry === 'string') {
      workspaceIds.add(entry.trim().toLowerCase());
    } else {
      collectScopeValues(entry, tenantIds, workspaceIds, visited);
    }
  }
}

function assertCompatibleTenantAccess(
  contextual: TenantDatabaseAccess,
  inferred: TenantDatabaseAccess | undefined,
): void {
  if (inferred === undefined) {
    return;
  }
  if (
    contextual.tenantId !== inferred.tenantId ||
    (inferred.workspaceId.length > 0 &&
      contextual.workspaceId !== inferred.workspaceId)
  ) {
    throw new Error('Prisma operation conflicts with database access scope');
  }
}

function first(values: Set<string>): string | undefined {
  return values.values().next().value as string | undefined;
}
