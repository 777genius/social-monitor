import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import type { PrismaSummaryClient } from "./prisma-summary-client";

export type PrismaSummaryTransactionOptions = {
  readonly isolationLevel?: "Serializable";
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
): Promise<TValue> => {
  if (!isTransactionalSummaryClient(client)) {
    return operation(client);
  }

  return client.$transaction(operation, { isolationLevel: "Serializable" });
};

const isTransactionalSummaryClient = (
  client: PrismaSummaryClient,
): client is PrismaTransactionalSummaryClient =>
  "$transaction" in client && typeof client.$transaction === "function";
