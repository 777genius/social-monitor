import type { Pool } from "pg";
import type { PostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import type { PrismaSummaryTransactionOptions, PrismaTransactionalSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-transaction";

export type NativeFirstpubSocketConfig = Readonly<{ socketHost: string; database: string }>;
export type NativeFirstpubPrismaConnection = PrismaTransactionalSummaryClient & { close(): Promise<void> };
export type NativeFirstpubTransactionHooks = Readonly<{
  afterTenantContext?: (transaction: PrismaReaderSummaryClient) => Promise<void>;
  afterDeadline?: (transaction: PrismaReaderSummaryClient) => Promise<void>;
}>;

export function nativeFirstpubRuntimeConfig(input: NativeFirstpubSocketConfig): PostgresRuntimePoolConfig {
  if (!/^\/proc\/\d+\/cwd\/\.firstpub-native-pg18-[A-Za-z0-9]+\/socket$/u.test(input.socketHost) ||
      !/^firstpub_synthetic(?:_claim_(?:jobs|artifacts|publications|slots|daily_model_jobs)_(?:failed|unknown))?$/u.test(input.database)) {
    throw new Error("Prisma fixture requires its bounded own synthetic socket/database");
  }
  return Object.freeze({
    processId: "daily-runner", min: 0, max: 2,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000,
    // The pg parser takes host from the query parameter: this is an owned Unix
    // socket, with a synthetic finite LOGIN and no password or environment URL.
    connectionString: `postgresql://firstpub_synthetic_finite@localhost:5432/${input.database}?host=${encodeURIComponent(input.socketHost)}`,
  });
}

/** Only forwarding around the existing connection. Prisma owns transactions,
 * SQL serialization, query results, errors, commit and rollback. */
export function forwardFirstpubPrismaTransactions<T extends Pick<PrismaTransactionalSummaryClient, "$transaction">>(
  connection: T, hooks: NativeFirstpubTransactionHooks = {},
): T {
  const transaction = async <TValue>(
    operation: (client: PrismaReaderSummaryClient) => Promise<TValue>,
    options?: PrismaSummaryTransactionOptions,
  ): Promise<TValue> => connection.$transaction(async (client) => {
    if (hooks.afterTenantContext !== undefined) {
      // Tenant middleware configures the genuine transaction on its first
      // scoped query. An observation establishes that snapshot before the
      // competing writer; no fixture code writes tenant context itself.
      await client.$queryRaw`SELECT current_setting('social_monitor.tenant_id') AS tenant_id,
        current_setting('social_monitor.workspace_id') AS workspace_id,
        current_setting('social_monitor.system_access') AS system_access`;
      await hooks.afterTenantContext(client);
    }
    let deadlineObserved = false;
    const query: PrismaReaderSummaryClient["$queryRaw"] = async <TResult>(sql: TemplateStringsArray, ...values: readonly unknown[]): Promise<TResult> => {
      const result = await client.$queryRaw<TResult>(sql, ...values);
      if (!deadlineObserved && sql.join("").includes("set_config('statement_timeout'")) {
        deadlineObserved = true;
        await hooks.afterDeadline?.(client);
      }
      return result;
    };
    return operation(new Proxy(client, {
      get(target, property) {
        if (property === "$queryRaw") return query;
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }));
  }, options);
  return new Proxy(connection, {
    get(target, property) {
      if (property === "$transaction") return transaction;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export async function createNativeFirstpubPrismaConnection(
  input: NativeFirstpubSocketConfig, hooks: NativeFirstpubTransactionHooks = {},
): Promise<NativeFirstpubPrismaConnection> {
  // Missing generated output fails through the unchanged production loader.
  // No generation, alternate client, injected adapter or pg SQL fallback.
  const connection = await PrismaSummaryConnection.create(nativeFirstpubRuntimeConfig(input));
  return forwardFirstpubPrismaTransactions(connection, hooks);
}

/** The frozen crash entry still consumes a synchronous client-shaped handle.
 * This handle only waits for async construction and forwards to that genuine
 * connection. It does not use its supplied administrative Pool for any query.
 * Owned native callers use/await createNativeFirstpubPrismaConnection instead.
 * The protected crash refusal/loader proof remains a separate acceptance gap. */
export function nativeFirstpubPrismaClient(pool: Pool): NativeFirstpubPrismaConnection {
  const options = pool.options;
  if (options?.user !== "firstpub_synthetic_finite" || options.port !== 5432 ||
      typeof options.host !== "string" || typeof options.database !== "string" ||
      options.connectionString !== undefined) {
    throw new Error("Frozen crash handle requires its explicit finite synthetic Pool config");
  }
  return deferFirstpubPrismaConnection(createNativeFirstpubPrismaConnection({
    socketHost: options.host, database: options.database,
  }));
}

/** Compatibility forwarding only; never a generated-client substitute. */
export function deferFirstpubPrismaConnection(
  pending: Promise<NativeFirstpubPrismaConnection>,
): NativeFirstpubPrismaConnection {
  const delegates = new Map<PropertyKey, object>();
  const invoke = async (property: PropertyKey, args: unknown[], member?: PropertyKey) => {
    const connection = await pending;
    const receiver: object = member === undefined ? connection : Reflect.get(connection, property, connection) as object;
    const method: unknown = Reflect.get(receiver, member ?? property, receiver);
    if (typeof method !== "function") throw new TypeError("Genuine Prisma connection has no requested method");
    return Reflect.apply(method, receiver, args) as unknown;
  };
  return new Proxy({} as NativeFirstpubPrismaConnection, {
    has: (_target, property) => property === "$transaction" || property === "close" || property === "$queryRaw",
    get(_target, property) {
      if (property === "then") return undefined;
      if (property === "close" || (typeof property === "string" && property.startsWith("$"))) {
        return (...args: unknown[]) => invoke(property, args);
      }
      let delegate = delegates.get(property);
      if (delegate === undefined) {
        delegate = new Proxy({}, { get: (_object, member) => (...args: unknown[]) => invoke(property, args, member) });
        delegates.set(property, delegate);
      }
      return delegate;
    },
  });
}

/** Failed close leaves the owner in the set and blocks subsequent destruction.
 * Never tears down the global registry or another fixture's pool. No retries. */
export async function closeFirstpubPrismaOwners(owners: Set<{ close(): Promise<void> }>): Promise<void> {
  const results = await Promise.allSettled([...owners].map(async (owner) => {
    await owner.close();
    owners.delete(owner);
  }));
  const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason as unknown] : []);
  if (failures.length !== 0) throw new AggregateError(failures, "Owned Prisma close failed; retain native fixture evidence");
}

/** Actual pinned Prisma 7.9 raw errors retain adapter diagnostics in meta.
 * Raw administrative pg queries continue asserting top-level SQLSTATE. */
export async function expectFirstpubPrismaSqlState(operation: Promise<unknown>, state: string): Promise<void> {
  await expect(operation).rejects.toMatchObject({
    name: "PrismaClientKnownRequestError", clientVersion: "7.9.1", code: "P2010",
    meta: { driverAdapterError: { cause: { originalCode: state } } },
  });
}
