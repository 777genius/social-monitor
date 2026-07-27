import { AsyncLocalStorage } from 'node:async_hooks';

import {
  currentDatabaseAccess,
  type DatabaseAccess,
} from './database-access-context';
import {
  assertSameDatabaseAccess,
  PRISMA_MODEL_OPERATIONS,
  PRISMA_RAW_OPERATIONS,
  prismaModelScope,
  resolvePrismaDatabaseAccess,
} from './prisma-database-scope';

type InteractiveTransactionContext = {
  readonly rootClient: object;
  readonly state: TransactionScopeState;
};

type TransactionScopeState = {
  access: DatabaseAccess | undefined;
  configured: Promise<void> | undefined;
};

type ProxyMetadata = {
  readonly root: boolean;
  readonly model: string | undefined;
  readonly transactionClient: object | undefined;
  readonly transactionState: TransactionScopeState | undefined;
};

const interactiveTransactionContext =
  new AsyncLocalStorage<InteractiveTransactionContext>();

const IMPLICIT_TRANSACTION_OPTIONS = {
  maxWait: 30_000,
  timeout: 300_000,
} as const;

export function guardRootClientDuringInteractiveTransaction<
  TClient extends object,
>(client: TClient): TClient {
  const proxyCache = new WeakMap<object, Map<string, object>>();

  const guardedObject = (
    target: object,
    metadata: ProxyMetadata,
  ): object => {
    const cacheKey = [
      metadata.root ? 'root' : 'nested',
      metadata.model ?? '',
      metadata.transactionClient === undefined ? 'client' : 'transaction',
    ].join(':');
    const targetCache = proxyCache.get(target) ?? new Map<string, object>();
    proxyCache.set(target, targetCache);
    const cached = targetCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const methodCache = new Map<PropertyKey, unknown>();
    const proxy = new Proxy(target, {
      get(currentTarget, property): unknown {
        const cachedMethod = methodCache.get(property);
        if (cachedMethod !== undefined) {
          return cachedMethod;
        }

        const value = Reflect.get(currentTarget, property, currentTarget) as unknown;
        if (typeof value === 'function') {
          const guardedMethod = (...args: unknown[]): unknown =>
            invokeGuardedMethod({
              args,
              currentTarget,
              metadata,
              property,
              value: value as (...args: unknown[]) => unknown,
              guardedObject,
              rawRootClient: client,
              rootClient,
            });
          methodCache.set(property, guardedMethod);
          return guardedMethod;
        }
        if (value !== null && typeof value === 'object') {
          const model =
            metadata.model === undefined &&
            typeof property === 'string' &&
            !property.startsWith('$')
              ? property
              : metadata.model;
          return guardedObject(value, { ...metadata, model, root: false });
        }
        return value;
      },
    });
    targetCache.set(cacheKey, proxy);
    return proxy;
  };

  const rootClient = guardedObject(client, {
    root: true,
    model: undefined,
    transactionClient: undefined,
    transactionState: undefined,
  }) as TClient;
  return rootClient;
}

function invokeGuardedMethod(params: {
  readonly args: unknown[];
  readonly currentTarget: object;
  readonly metadata: ProxyMetadata;
  readonly property: PropertyKey;
  readonly value: (...args: unknown[]) => unknown;
  readonly guardedObject: (
    target: object,
    metadata: ProxyMetadata,
  ) => object;
  readonly rawRootClient: object;
  readonly rootClient: object;
}): unknown {
  if (params.metadata.transactionClient === undefined) {
    assertRootClientOutsideInteractiveTransaction(params.rootClient);
  }
  const propertyName =
    typeof params.property === 'string' ? params.property : undefined;

  if (
    params.metadata.root &&
    propertyName === '$transaction' &&
    typeof params.args[0] === 'function'
  ) {
    return invokeInteractiveTransaction(params);
  }

  if (
    params.metadata.model !== undefined &&
    propertyName !== undefined &&
    PRISMA_MODEL_OPERATIONS.has(propertyName)
  ) {
    return invokeModelOperation(params, propertyName);
  }

  if (
    propertyName !== undefined &&
    PRISMA_RAW_OPERATIONS.has(propertyName) &&
    currentDatabaseAccess() !== undefined
  ) {
    return invokeRawOperation(params);
  }

  return Reflect.apply(params.value, params.currentTarget, params.args);
}

function invokeInteractiveTransaction(params: {
  readonly args: unknown[];
  readonly currentTarget: object;
  readonly value: (...args: unknown[]) => unknown;
  readonly guardedObject: (
    target: object,
    metadata: ProxyMetadata,
  ) => object;
  readonly rootClient: object;
}): unknown {
  const operation = params.args[0] as (transaction: object) => unknown;
  params.args[0] = (transaction: object): unknown => {
    const state: TransactionScopeState = {
      access: undefined,
      configured: undefined,
    };
    const guardedTransaction = params.guardedObject(transaction, {
      root: false,
      model: undefined,
      transactionClient: transaction,
      transactionState: state,
    });
    return interactiveTransactionContext.run(
      { rootClient: params.rootClient, state },
      () => operation(guardedTransaction),
    );
  };
  return Reflect.apply(params.value, params.currentTarget, params.args);
}

function invokeModelOperation(
  params: {
    readonly args: unknown[];
    readonly currentTarget: object;
    readonly metadata: ProxyMetadata;
    readonly value: (...args: unknown[]) => unknown;
    readonly rawRootClient: object;
    readonly rootClient: object;
  },
  operation: string,
): unknown {
  const model = params.metadata.model;
  if (model === undefined || prismaModelScope(model) === 'shared') {
    return Reflect.apply(params.value, params.currentTarget, params.args);
  }
  const access = resolvePrismaDatabaseAccess(model, params.args);
  if (access === undefined) {
    throw new Error(`Database access could not be resolved for ${model}`);
  }
  if (
    params.metadata.transactionClient !== undefined &&
    params.metadata.transactionState !== undefined
  ) {
    return invokeInsideTransaction(params, access);
  }
  return invokeInImplicitTransaction(
    params.rawRootClient,
    access,
    model,
    operation,
    params.args,
  );
}

async function invokeInsideTransaction(
  params: {
    readonly args: unknown[];
    readonly currentTarget: object;
    readonly metadata: ProxyMetadata;
    readonly value: (...args: unknown[]) => unknown;
  },
  access: DatabaseAccess,
): Promise<unknown> {
  const state = params.metadata.transactionState;
  const transaction = params.metadata.transactionClient;
  if (state === undefined || transaction === undefined) {
    throw new Error('Prisma transaction scope state is unavailable');
  }
  state.access = assertSameDatabaseAccess(state.access, access);
  await ensureTransactionConfigured(transaction, state);
  return Reflect.apply(params.value, params.currentTarget, params.args);
}

function invokeRawOperation(params: {
  readonly args: unknown[];
  readonly currentTarget: object;
  readonly metadata: ProxyMetadata;
  readonly value: (...args: unknown[]) => unknown;
  readonly rawRootClient: object;
  readonly rootClient: object;
}): unknown {
  const access = currentDatabaseAccess();
  if (access === undefined) {
    return Reflect.apply(params.value, params.currentTarget, params.args);
  }
  if (
    params.metadata.transactionClient !== undefined &&
    params.metadata.transactionState !== undefined
  ) {
    return invokeInsideTransaction(params, access);
  }
  const operation =
    typeof params.metadata.model === 'string'
      ? params.metadata.model
      : undefined;
  return invokeRawInImplicitTransaction(
    params.rawRootClient,
    access,
    params.value,
    params.currentTarget,
    params.args,
    operation,
  );
}

function invokeInImplicitTransaction(
  rawRootClient: object,
  access: DatabaseAccess,
  model: string,
  operation: string,
  args: readonly unknown[],
): unknown {
  return invokeRootTransaction(rawRootClient, async (transaction) => {
    await configureTransaction(transaction, access);
    const delegate = Reflect.get(transaction, model, transaction) as object;
    const method = Reflect.get(delegate, operation, delegate) as (
      ...operationArgs: unknown[]
    ) => unknown;
    return Reflect.apply(method, delegate, args);
  });
}

function invokeRawInImplicitTransaction(
  rawRootClient: object,
  access: DatabaseAccess,
  method: (...args: unknown[]) => unknown,
  target: object,
  args: readonly unknown[],
  operation: string | undefined,
): unknown {
  return invokeRootTransaction(rawRootClient, async (transaction) => {
    await configureTransaction(transaction, access);
    if (operation === undefined) {
      const property = rawOperationName(target, method);
      const transactionMethod = Reflect.get(transaction, property, transaction) as (
        ...operationArgs: unknown[]
      ) => unknown;
      return Reflect.apply(transactionMethod, transaction, args);
    }
    return Reflect.apply(method, target, args);
  });
}

function invokeRootTransaction(
  rootClient: object,
  operation: (transaction: object) => Promise<unknown>,
): unknown {
  const transaction = Reflect.get(rootClient, '$transaction', rootClient) as (
    callback: (client: object) => Promise<unknown>,
    options: typeof IMPLICIT_TRANSACTION_OPTIONS,
  ) => unknown;
  return Reflect.apply(transaction, rootClient, [
    operation,
    IMPLICIT_TRANSACTION_OPTIONS,
  ]);
}

async function ensureTransactionConfigured(
  transaction: object,
  state: TransactionScopeState,
): Promise<void> {
  state.configured ??= configureTransaction(transaction, requiredAccess(state));
  await state.configured;
}

function configureTransaction(
  transaction: object,
  access: DatabaseAccess,
): Promise<void> {
  const execute = Reflect.get(
    transaction,
    '$executeRawUnsafe',
    transaction,
  ) as (query: string, ...values: unknown[]) => Promise<unknown>;
  const tenantId = access.kind === 'tenant' ? access.tenantId : '';
  const workspaceId = access.kind === 'tenant' ? access.workspaceId : '';
  const systemAccess = access.kind === 'system' ? 'true' : 'false';
  return execute
    .call(
      transaction,
      `SELECT set_config('social_monitor.tenant_id', $1, true),
              set_config('social_monitor.workspace_id', $2, true),
              set_config('social_monitor.system_access', $3, true)`,
      tenantId,
      workspaceId,
      systemAccess,
    )
    .then(() => undefined);
}

function requiredAccess(state: TransactionScopeState): DatabaseAccess {
  if (state.access === undefined) {
    throw new Error('Prisma transaction database access is unavailable');
  }
  return state.access;
}

function rawOperationName(target: object, method: unknown): string {
  for (const operation of PRISMA_RAW_OPERATIONS) {
    if (Reflect.get(target, operation, target) === method) {
      return operation;
    }
  }
  throw new Error('Unknown Prisma raw operation');
}

function assertRootClientOutsideInteractiveTransaction(rootClient: object): void {
  if (interactiveTransactionContext.getStore()?.rootClient === rootClient) {
    throw new Error(
      'Root Prisma client cannot be used inside an interactive transaction; use the transaction client argument',
    );
  }
}
