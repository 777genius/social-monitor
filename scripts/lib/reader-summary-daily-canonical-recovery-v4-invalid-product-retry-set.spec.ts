import type {
  ReaderSummaryDailySqlClient,
  ReaderSummaryDailySqlTransaction,
} from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-daily-execution-cursor-row";

import {
  PostgresCanonicalRecoveryInvalidProductRetrySetAuthorizer,
  canonicalInvalidProductRetrySetSha256,
  invalidProductRetryDates,
  invalidProductRetrySetToken,
} from "./reader-summary-daily-canonical-recovery-v4-invalid-product-retry-set";
import {
  assertReaderSummaryDailyCanonicalRecoveryV4InvalidProductRetrySetMigrationContract,
} from "./reader-summary-daily-canonical-recovery-v4-invalid-product-retry-set-postgres-contract";

const tenantId = "00000000-0000-7000-8000-000000000901";
const workspaceId = "00000000-0000-7000-8000-000000000902";

const terminalSet = () => invalidProductRetryDates.map((requestedUtcDate, index) => ({
  requestedUtcDate,
  modelJobIdentity: `${index}`.repeat(64),
  sourceAuthoritySha256: `${index + 1}`.repeat(64),
}));

describe("daily canonical recovery v4 invalid-product retry set", () => {
  it("keeps the nullable retry-set Prisma fields in migration parity", () => {
    expect(() =>
      assertReaderSummaryDailyCanonicalRecoveryV4InvalidProductRetrySetMigrationContract(),
    ).not.toThrow();
  });

  it("hashes the exact sorted six-terminal identity without any provider payload", () => {
    const ordered = terminalSet();
    const reversed = [...ordered].reverse();

    expect(canonicalInvalidProductRetrySetSha256(ordered)).toMatch(/^[0-9a-f]{64}$/u);
    expect(canonicalInvalidProductRetrySetSha256(reversed))
      .toBe(canonicalInvalidProductRetrySetSha256(ordered));
    expect(invalidProductRetrySetToken).toBe("invalid-product-retry-set-v1");
  });

  it.each([
    [[] as ReturnType<typeof terminalSet>],
    [terminalSet().slice(0, 5)],
    [[{ ...terminalSet()[0]!, requestedUtcDate: "2026-07-24" }]],
    [[{ ...terminalSet()[0]!, modelJobIdentity: "A".repeat(64) }]],
  ])("rejects a partial, widened, or malformed terminal set", (entries) => {
    expect(() => canonicalInvalidProductRetrySetSha256(
      entries as Parameters<typeof canonicalInvalidProductRetrySetSha256>[0],
    )).toThrow(/terminal set/u);
  });

  it("uses a serializable call and accepts only the ordered six database rows", async () => {
    const query = jest.fn(async () => ({
      rows: invalidProductRetryDates.map((requestedUtcDate, index) => ({
        requested_utc_date: requestedUtcDate,
        model_job_identity: `${index}`.repeat(64),
        authorization_sha256: `${index + 1}`.repeat(64),
      })),
      rowCount: 6,
    }));
    const transaction = { query } as unknown as ReaderSummaryDailySqlTransaction;
    const client: ReaderSummaryDailySqlClient = {
      query: async () => {
        throw new Error("retry-set authorization must be serializable");
      },
      serializable: async (operation) => operation(transaction),
    };

    await expect(new PostgresCanonicalRecoveryInvalidProductRetrySetAuthorizer(client)
      .authorize({
        tenantId,
        workspaceId,
        terminalSetSha256: "a".repeat(64),
      })).resolves.toEqual(invalidProductRetryDates.map((requestedUtcDate, index) => ({
      requestedUtcDate,
      modelJobIdentity: `${index}`.repeat(64),
      authorizationSha256: `${index + 1}`.repeat(64),
    })));
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "authorize_reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set",
      ),
      [tenantId, workspaceId, "a".repeat(64)],
    );
  });

  it("rejects digest, coverage, and ordering forgeries before a model can be reached", async () => {
    const serializable = jest.fn();
    const client = { serializable } as unknown as ReaderSummaryDailySqlClient;
    const authorizer = new PostgresCanonicalRecoveryInvalidProductRetrySetAuthorizer(client);

    await expect(authorizer.authorize({
      tenantId,
      workspaceId,
      terminalSetSha256: "A".repeat(64),
    })).rejects.toThrow(/SHA-256/u);
    expect(serializable).not.toHaveBeenCalled();
  });
});
