import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import type { PrismaSummaryClient } from "./prisma-summary-client";

export type PrismaSummaryTransactionOptions = {
  readonly isolationLevel?: "Serializable" | "ReadCommitted";
  readonly maxWait?: number;
  readonly timeout?: number;
};

export type PrismaTransactionalSummaryClient = PrismaSummaryClient & {
  readonly $transaction: <TValue>(
    operation: (client: PrismaReaderSummaryClient) => Promise<TValue>,
    options?: PrismaSummaryTransactionOptions,
  ) => Promise<TValue>;
};

export const runSerializableReaderSummaryTransaction = <TValue>(
  client: PrismaSummaryClient,
  operation: (client: PrismaReaderSummaryClient) => Promise<TValue>,
  options?: PrismaSummaryTransactionOptions,
): Promise<TValue> => {
  if (!isTransactionalSummaryClient(client)) {
    return operation(client);
  }

  return client.$transaction(operation, {
    ...options,
    isolationLevel: "Serializable",
  });
};

const isTransactionalSummaryClient = (
  client: PrismaSummaryClient,
): client is PrismaTransactionalSummaryClient =>
  "$transaction" in client && typeof client.$transaction === "function";

export const requireSerializableReaderSummaryTransactions = (
  client: PrismaSummaryClient,
): void => {
  if (!isTransactionalSummaryClient(client)) {
    throw new Error("Reader summary V3 requires Prisma transaction capability");
  }
};

/** Explicit Sep29 firstpub protocol only. Strong DB-owned relation locks are
 * acquired before validation, whose statements need fresh snapshots even
 * after tenant middleware and the publication deadline SELECT have run. */
export const runFirstPublicationReaderSummaryTransaction = <TValue>(
  client: PrismaSummaryClient,
  operation: (client: PrismaReaderSummaryClient) => Promise<TValue>,
  options?: Omit<PrismaSummaryTransactionOptions, "isolationLevel">,
): Promise<TValue> => {
  requireSerializableReaderSummaryTransactions(client);
  return (client as PrismaTransactionalSummaryClient).$transaction(operation, {
    ...options, isolationLevel: "ReadCommitted",
  });
};
