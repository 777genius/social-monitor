import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import {
  runSerializableReaderSummaryTransaction,
  type PrismaSummaryTransactionOptions,
  type PrismaTransactionalSummaryClient,
} from "./prisma-summary-transaction";

describe("runSerializableReaderSummaryTransaction", () => {
  it("uses exactly a Serializable transaction by default", async () => {
    const transactionClient = {} as PrismaReaderSummaryClient;
    const operation = jest.fn(async (client: PrismaReaderSummaryClient) => {
      expect(client).toBe(transactionClient);
      return "saved";
    });
    const transaction = jest.fn(
      async <TValue>(
        callback: (client: PrismaReaderSummaryClient) => Promise<TValue>,
        options?: PrismaSummaryTransactionOptions,
      ) => {
        expect(options).toEqual({ isolationLevel: "Serializable" });
        return callback(transactionClient);
      },
    );
    const client = {
      $transaction: transaction,
    } as unknown as PrismaTransactionalSummaryClient;

    await expect(
      runSerializableReaderSummaryTransaction(client, operation),
    ).resolves.toBe("saved");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("merges explicit transaction options with Serializable isolation", async () => {
    const transactionClient = {} as PrismaReaderSummaryClient;
    const operation = jest.fn(async () => "saved");
    const transaction = jest.fn(
      async <TValue>(
        callback: (client: PrismaReaderSummaryClient) => Promise<TValue>,
        options?: PrismaSummaryTransactionOptions,
      ) => {
        expect(options).toEqual({
          maxWait: 25,
          timeout: 250,
          isolationLevel: "Serializable",
        });
        return callback(transactionClient);
      },
    );
    const client = {
      $transaction: transaction,
    } as unknown as PrismaTransactionalSummaryClient;

    await expect(
      runSerializableReaderSummaryTransaction(client, operation, {
        maxWait: 25,
        timeout: 250,
      }),
    ).resolves.toBe("saved");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("runs directly for legacy non-transactional test adapters", async () => {
    const client = {} as PrismaSummaryClient;
    const operation = jest.fn(async () => "saved");

    await expect(
      runSerializableReaderSummaryTransaction(client, operation),
    ).resolves.toBe("saved");
    expect(operation).toHaveBeenCalledWith(client);
  });
});
