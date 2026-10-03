import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import type { PrismaSummaryTransactionOptions } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-transaction";
import {
  closeFirstpubPrismaOwners, deferFirstpubPrismaConnection,
  forwardFirstpubPrismaTransactions, type NativeFirstpubPrismaConnection,
} from "./reader-summary-first-publication-pg18-prisma.spec-support";

// These contracts use controlled promises, never a fake Prisma engine or pg
// connection. They prove only our test-local forwarding and owner bookkeeping.
function barrier<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// RED if a hook runs before its awaited observation/deadline, options are lost,
// receiver binding breaks, or a query's real result is replaced by the wrapper.
it("awaits observations and schedule hooks while forwarding exact options, receivers and results", async () => {
  const observation = barrier<unknown>(), deadline = barrier<unknown>();
  const tenantHook = barrier<void>(), deadlineHook = barrier<void>();
  const tenantEntered = barrier<void>(), deadlineEntered = barrier<void>(), deadlineCalled = barrier<void>();
  const calls: string[] = [];
  const queryInputs: Array<{ sql: TemplateStringsArray; values: unknown[] }> = [];
  const result = [{ marker: Symbol("forwarded result") }];
  let call = 0;
  const tx = {
    $queryRaw: jest.fn(function (this: unknown, sql: TemplateStringsArray, ...values: unknown[]) {
      expect(this).toBe(tx);
      queryInputs.push({ sql, values });
      call++;
      calls.push(`query${call}`);
      if (call === 2) deadlineCalled.resolve();
      return call === 1 ? observation.promise : call === 2 ? deadline.promise : Promise.resolve(result);
    }),
    readerSummaryJob: { findFirst: jest.fn().mockResolvedValue(result[0]) },
  };
  const options = { isolationLevel: "ReadCommitted", maxWait: 31, timeout: 47 } as const;
  const owner = {
    async $transaction<T>(operation: (client: PrismaReaderSummaryClient) => Promise<T>, received?: PrismaSummaryTransactionOptions) {
      expect(this).toBe(owner);
      expect(received).toBe(options);
      return operation(tx as unknown as PrismaReaderSummaryClient);
    },
  };
  const wrapped = forwardFirstpubPrismaTransactions(owner, {
    afterTenantContext: async (client) => {
      expect(client).toBe(tx); calls.push("tenant hook"); tenantEntered.resolve(); await tenantHook.promise;
    },
    afterDeadline: async (client) => {
      expect(client).toBe(tx); calls.push("deadline hook"); deadlineEntered.resolve(); await deadlineHook.promise;
    },
  });
  const operation = wrapped.$transaction(async (client) => {
    calls.push("body");
    expect(client.readerSummaryJob).toBe(tx.readerSummaryJob);
    await client.$queryRaw`SELECT set_config('statement_timeout', ${300000}, true)`;
    return client.$queryRaw`SELECT 1`;
  }, options);
  expect(calls).toEqual(["query1"]);
  observation.resolve([]); await tenantEntered.promise;
  expect(calls).toEqual(["query1", "tenant hook"]);
  tenantHook.resolve();
  await deadlineCalled.promise;
  expect(calls).toEqual(["query1", "tenant hook", "body", "query2"]);
  deadline.resolve(result); await deadlineEntered.promise;
  expect(calls).not.toContain("query3");
  deadlineHook.resolve();
  expect(await operation).toBe(result);
  expect(calls.at(-1)).toBe("query3");
  expect(queryInputs[1]?.values).toEqual([300000]);
  expect(queryInputs[1]?.sql).toEqual(["SELECT set_config('statement_timeout', ", ", true)"]);
});

// RED if a query/async-hook rejection is swallowed, wrapped in a different
// error, or followed by another schedule/body action after it failed.
it("preserves async query and hook failures without running later actions", async () => {
  const queryFailure = new Error("query refused");
  const hookFailure = new Error("hook refused");
  const hooks = { afterTenantContext: jest.fn(async () => { throw hookFailure; }) };
  const tx = { $queryRaw: jest.fn().mockRejectedValue(queryFailure) };
  const owner = {
    async $transaction<T>(body: (client: PrismaReaderSummaryClient) => Promise<T>) {
      return body(tx as unknown as PrismaReaderSummaryClient);
    },
  };
  const body = jest.fn();
  const wrapped = forwardFirstpubPrismaTransactions(owner, hooks);
  await expect(wrapped.$transaction(body)).rejects.toBe(queryFailure);
  expect(hooks.afterTenantContext).not.toHaveBeenCalled();
  tx.$queryRaw.mockResolvedValue([]);
  await expect(wrapped.$transaction(body)).rejects.toBe(hookFailure);
  expect(body).not.toHaveBeenCalled();
  const afterDeadline = jest.fn(async () => { throw hookFailure; });
  const deadlineWrapped = forwardFirstpubPrismaTransactions(owner, { afterDeadline });
  const later = jest.fn();
  await expect(deadlineWrapped.$transaction(async (client) => {
    await client.$queryRaw`SELECT set_config('statement_timeout', ${300000}, true)`;
    later();
  })).rejects.toBe(hookFailure);
  expect(afterDeadline).toHaveBeenCalledWith(tx);
  expect(later).not.toHaveBeenCalled();
});

// RED if the frozen caller's handle queries anything before construction,
// loses a delegate receiver/result, or hides a construction/close rejection.
it("defers legacy calls to the actual eventual owner and forwards rejection identity", async () => {
  const constructed = barrier<NativeFirstpubPrismaConnection>();
  const delegate = { findFirst: jest.fn(function (this: unknown, input: unknown) {
    expect(this).toBe(delegate); return Promise.resolve(input);
  }) };
  const closeFailure = new Error("close refused");
  const owner = {
    readerSummaryJob: delegate,
    close: jest.fn(function (this: unknown) { expect(this).toBe(owner); return Promise.reject(closeFailure); }),
  } as unknown as NativeFirstpubPrismaConnection;
  const deferred = deferFirstpubPrismaConnection(constructed.promise);
  const args = { where: { tenantId: "synthetic", workspaceId: "synthetic" } };
  const result = deferred.readerSummaryJob.findFirst(args);
  expect(delegate.findFirst).not.toHaveBeenCalled();
  constructed.resolve(owner);
  expect(await result).toBe(args);
  await expect(deferred.close()).rejects.toBe(closeFailure);
  const failure = new Error("construction refused");
  const refused = deferFirstpubPrismaConnection(Promise.reject(failure));
  await expect(refused.$queryRaw`SELECT 1`).rejects.toBe(failure);
});

// RED if cleanup finishes before a pending owner closes, forgets a failed
// owner, closes an unowned resource, or destroys evidence after uncertainty.
it("waits for every own close and retains failed ownership for uncertain cleanup", async () => {
  const closing = barrier<void>();
  const failure = new Error("owned close uncertain");
  const first = { close: jest.fn(() => closing.promise) };
  const second = { close: jest.fn().mockRejectedValue(failure) };
  const foreign = { close: jest.fn() };
  const owners = new Set([first, second]);
  const destroy = jest.fn();
  const cleanup = closeFirstpubPrismaOwners(owners).then(destroy);
  const outcome = cleanup.catch((error: unknown) => error);
  expect(owners.has(first)).toBe(true);
  expect(destroy).not.toHaveBeenCalled();
  closing.resolve();
  expect(await outcome).toMatchObject({ errors: [failure] });
  expect(owners).toEqual(new Set([second]));
  expect(foreign.close).not.toHaveBeenCalled();
  expect(destroy).not.toHaveBeenCalled();
});
