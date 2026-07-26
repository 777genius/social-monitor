import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantDatabaseAccess = {
  readonly kind: 'tenant';
  readonly tenantId: string;
  readonly workspaceId: string;
};

export type SystemDatabaseAccess = {
  readonly kind: 'system';
  readonly reason: string;
};

export type DatabaseAccess = TenantDatabaseAccess | SystemDatabaseAccess;

export class InvalidTenantDatabaseAccessError extends Error {
  constructor(readonly field: 'tenantId' | 'workspaceId') {
    super(`Database access ${field} must be a UUID`);
    this.name = 'InvalidTenantDatabaseAccessError';
  }
}

const databaseAccessStorage = new AsyncLocalStorage<DatabaseAccess>();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function currentDatabaseAccess(): DatabaseAccess | undefined {
  return databaseAccessStorage.getStore();
}

export function runWithTenantDatabaseAccess<T>(
  scope: {
    readonly tenantId: string;
    readonly workspaceId: string;
  },
  operation: () => T,
): T {
  const access: TenantDatabaseAccess = {
    kind: 'tenant',
    tenantId: validatedUuid(scope.tenantId, 'tenantId'),
    workspaceId: validatedUuid(scope.workspaceId, 'workspaceId'),
  };
  return runWithCompatibleAccess(access, operation);
}

export function runWithSystemDatabaseAccess<T>(
  reason: string,
  operation: () => T,
): T {
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 3 || normalizedReason.length > 120) {
    throw new Error(
      'System database access reason must contain between 3 and 120 characters',
    );
  }
  return runWithCompatibleAccess(
    { kind: 'system', reason: normalizedReason },
    operation,
  );
}

function runWithCompatibleAccess<T>(
  access: DatabaseAccess,
  operation: () => T,
): T {
  const current = currentDatabaseAccess();
  if (current !== undefined && !sameAccess(current, access)) {
    throw new Error('Nested database access scope cannot change');
  }
  return current === undefined
    ? databaseAccessStorage.run(access, operation)
    : operation();
}

function sameAccess(left: DatabaseAccess, right: DatabaseAccess): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  return left.kind === 'system'
    ? true
    : left.tenantId === (right as TenantDatabaseAccess).tenantId &&
        left.workspaceId === (right as TenantDatabaseAccess).workspaceId;
}

function validatedUuid(
  value: string,
  label: InvalidTenantDatabaseAccessError['field'],
): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new InvalidTenantDatabaseAccessError(label);
  }
  return normalized;
}
