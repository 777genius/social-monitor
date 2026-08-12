import type { ReaderSummaryDailySqlClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-daily-execution-cursor-row";

import {
  createReaderSummaryDailyDeliveryC1ClaimNext,
  readerSummaryDailyDeliveryC1Mode,
} from "./reader-summary-daily-delivery-c1-cursor";

const claim = {
  tenantId: "00000000-0000-7000-8000-000000000901",
  workspaceId: "00000000-0000-7000-8000-000000000902",
  workerId: "c1-worker",
  firstUnresolvedUtcDate: "2026-07-23",
  invokedAt: "2026-08-11T12:00:00.000Z",
};

describe("daily delivery C1 cursor route", () => {
  it("initializes an absent cursor at Jul23 and uses only the C1 legacy claim", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({
        rows: [advanced("2026-07-23")],
      })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [claimedRow("2026-07-23")] });
    const cursor = {
      claimExactBoundedMaintenance: jest.fn(),
      claimNext: jest.fn(),
    };
    const claimNext = createReaderSummaryDailyDeliveryC1ClaimNext({
      client: serializableClient(query),
      cursor: cursor as never,
      claim,
      mode: readerSummaryDailyDeliveryC1Mode,
      recoveryThrough: "2026-08-10",
      now: () => new Date(claim.invokedAt),
    });

    await expect(claimNext()).resolves.toMatchObject({
      kind: "claimed",
      work: { requestedUtcDate: "2026-07-23" },
    });
    expect(query.mock.calls[3]?.[1]).toEqual([
      claim.tenantId,
      claim.workspaceId,
      claim.workerId,
      "2026-07-23",
      claim.invokedAt,
    ]);
    expect(cursor.claimExactBoundedMaintenance).not.toHaveBeenCalled();
    expect(cursor.claimNext).not.toHaveBeenCalled();
  });

  it("adopts exact C0 evidence only at Jul25 then uses bounded claim", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({
        rows: [advanced("2026-07-31")],
      });
    const cursor = {
      claimExactBoundedMaintenance: jest.fn().mockResolvedValue({
        kind: "claimed",
        work: {
          requestedUtcDate: "2026-07-31",
          eligibleThrough: "2026-08-03",
        },
      }),
      claimNext: jest.fn(),
    };
    const claimNext = createReaderSummaryDailyDeliveryC1ClaimNext({
      client: serializableClient(query),
      cursor: cursor as never,
      claim,
      mode: readerSummaryDailyDeliveryC1Mode,
      recoveryThrough: "2026-08-10",
      now: () => new Date(claim.invokedAt),
    });

    await expect(claimNext()).resolves.toMatchObject({ kind: "claimed" });
    expect(cursor.claimExactBoundedMaintenance).toHaveBeenCalledWith({
      tenantId: claim.tenantId,
      workspaceId: claim.workspaceId,
      workerId: claim.workerId,
      requestedUtcDate: "2026-07-31",
      invokedAt: claim.invokedAt,
    });
    expect(cursor.claimNext).not.toHaveBeenCalled();
  });

  it("returns to the unchanged ordinary claim after the bounded range", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({
        rows: [advanced("2026-08-04")],
      });
    const cursor = {
      claimExactBoundedMaintenance: jest.fn(),
      claimNext: jest.fn().mockResolvedValue({
        kind: "caught_up",
        eligibleThrough: "2026-08-10",
      }),
    };
    const claimNext = createReaderSummaryDailyDeliveryC1ClaimNext({
      client: serializableClient(query),
      cursor: cursor as never,
      claim,
      mode: readerSummaryDailyDeliveryC1Mode,
      recoveryThrough: "2026-08-10",
      now: () => new Date(claim.invokedAt),
    });

    await expect(claimNext()).resolves.toMatchObject({ kind: "caught_up" });
    expect(cursor.claimNext).toHaveBeenCalledWith(claim);
    expect(cursor.claimExactBoundedMaintenance).not.toHaveBeenCalled();
  });

  it("fails closed outside exact C1 mode and scope", () => {
    const input = {
      client: serializableClient(jest.fn()),
      cursor: {} as never,
      claim,
    };
    expect(() =>
      createReaderSummaryDailyDeliveryC1ClaimNext({
        ...input,
        mode: undefined,
        recoveryThrough: "2026-08-10",
      }),
    ).toThrow("requires exact mode");
    expect(() =>
      createReaderSummaryDailyDeliveryC1ClaimNext({
        ...input,
        claim: {
          ...claim,
          workspaceId: "00000000-0000-7000-8000-000000000999",
        },
        mode: readerSummaryDailyDeliveryC1Mode,
        recoveryThrough: "2026-08-10",
      }),
    ).toThrow("scope is invalid");
  });

  it("uses one fresh invokedAt per claim and one value across its SQL route", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [advanced("2026-08-10")] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [advanced("2026-08-10")] });
    const cursor = {
      claimExactBoundedMaintenance: jest.fn(),
      claimNext: jest
        .fn()
        .mockResolvedValueOnce({
          kind: "leased",
          requestedUtcDate: "2026-08-10",
        })
        .mockResolvedValueOnce({
          kind: "caught_up",
          eligibleThrough: "2026-08-10",
        }),
    };
    const now = jest
      .fn()
      .mockReturnValueOnce(new Date("2026-08-11T12:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-08-11T12:06:00.000Z"));
    const claimNext = createReaderSummaryDailyDeliveryC1ClaimNext({
      client: serializableClient(query),
      cursor: cursor as never,
      claim,
      mode: readerSummaryDailyDeliveryC1Mode,
      recoveryThrough: "2026-08-10",
      now,
    });

    await expect(claimNext()).resolves.toMatchObject({ kind: "leased" });
    await expect(claimNext()).resolves.toMatchObject({ kind: "caught_up" });
    expect(now).toHaveBeenCalledTimes(2);
    expect(cursor.claimNext).toHaveBeenNthCalledWith(1, {
      ...claim,
      invokedAt: "2026-08-11T12:00:00.000Z",
    });
    expect(cursor.claimNext).toHaveBeenNthCalledWith(2, {
      ...claim,
      invokedAt: "2026-08-11T12:06:00.000Z",
    });
    expect(query.mock.calls[1]?.[1]?.[3]).toBe("2026-08-11T12:00:00.000Z");
    expect(query.mock.calls[3]?.[1]?.[3]).toBe("2026-08-11T12:06:00.000Z");
  });

  it("rejects a post-midnight claim before any SQL or cursor write", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [advanced("2026-08-10")] });
    const cursor = {
      claimExactBoundedMaintenance: jest.fn(),
      claimNext: jest.fn().mockResolvedValue({
        kind: "leased",
        requestedUtcDate: "2026-08-10",
      }),
    };
    const now = jest
      .fn()
      .mockReturnValueOnce(new Date("2026-08-11T23:59:59.900Z"))
      .mockReturnValueOnce(new Date("2026-08-12T00:00:00.100Z"));
    const claimNext = createReaderSummaryDailyDeliveryC1ClaimNext({
      client: serializableClient(query),
      cursor: cursor as never,
      claim,
      mode: readerSummaryDailyDeliveryC1Mode,
      recoveryThrough: "2026-08-10",
      now,
    });

    await expect(claimNext()).resolves.toMatchObject({ kind: "leased" });
    await expect(claimNext()).rejects.toThrow(
      "invokedAt does not match recovery-through",
    );
    expect(query).toHaveBeenCalledTimes(2);
    expect(cursor.claimNext).toHaveBeenCalledTimes(1);
    expect(cursor.claimExactBoundedMaintenance).not.toHaveBeenCalled();
  });

  it("rejects missing, malformed, mismatched, or post-boundary C1 data", async () => {
    const input = {
      client: serializableClient(jest.fn()),
      cursor: {} as never,
      claim,
      mode: readerSummaryDailyDeliveryC1Mode,
      now: () => new Date(claim.invokedAt),
    };
    expect(() =>
      createReaderSummaryDailyDeliveryC1ClaimNext({
        ...input,
        recoveryThrough: "bad",
      }),
    ).toThrow("recovery-through date is invalid");
    const mismatchedClaim = createReaderSummaryDailyDeliveryC1ClaimNext({
      ...input,
      recoveryThrough: "2026-08-09",
    });
    await expect(mismatchedClaim()).rejects.toThrow(
      "invokedAt does not match recovery-through",
    );

    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [advanced("2026-08-11")] });
    const claimNext = createReaderSummaryDailyDeliveryC1ClaimNext({
      ...input,
      client: serializableClient(query),
      cursor: {
        claimExactBoundedMaintenance: jest.fn(),
        claimNext: jest.fn().mockResolvedValue({
          kind: "claimed",
          work: {
            requestedUtcDate: "2026-08-11",
            eligibleThrough: "2026-08-10",
          },
        }),
      } as never,
      recoveryThrough: "2026-08-10",
    });
    await expect(claimNext()).rejects.toThrow(
      "claimed beyond recovery-through",
    );
  });
});

const advanced = (nextUnresolvedUtcDate: string) => ({
  nextUnresolvedUtcDate,
  eligibleThrough: "2026-08-10",
});

const serializableClient = (query: jest.Mock): ReaderSummaryDailySqlClient => ({
  query: async () => {
    throw new Error("unscoped query");
  },
  serializable: async (operation) => operation({ query }),
});

const claimedRow = (requestedUtcDate: string) => ({
  outcome: "CLAIMED",
  tenant_id: claim.tenantId,
  workspace_id: claim.workspaceId,
  requested_utc_date: requestedUtcDate,
  eligible_through: "2026-08-10",
  ingestion_cutoff: "2026-07-24T00:00:00.000Z",
  source_canonical_bytes: Buffer.from("{}"),
  source_canonical_sha256: "a".repeat(64),
  model_job_state: "RESERVED",
  lease_owner: claim.workerId,
  fencing_token: 1n,
  leased_at: claim.invokedAt,
  lease_expires_at: "2026-08-11T12:05:00.000Z",
  absolute_expires_at: "2026-08-11T12:15:00.000Z",
  response_bytes: null,
  receipt_bytes: null,
});
