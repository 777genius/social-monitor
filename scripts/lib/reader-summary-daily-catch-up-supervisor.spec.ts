import type {
  ReaderSummaryDailyClaimResult,
  ReaderSummaryDailyExecutionWork,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";
import { readerSummaryDailyModelJobIdentity } from "@social-monitor/summary/domain/value-objects/reader-summary-daily-model-job";

import { ReaderSummaryDailyCatchUpSupervisor } from "./reader-summary-daily-catch-up-supervisor";

describe("ReaderSummaryDailyCatchUpSupervisor", () => {
  it("claims oldest-first before provider verification and model execution", async () => {
    const claims: ReaderSummaryDailyClaimResult[] = [
      claimed(work("2026-07-27", "RESERVED")),
      claimed(work("2026-07-28", "COMPLETED")),
      { kind: "caught_up", eligibleThrough: "2026-07-28" },
    ];
    const order: string[] = [];
    const result = await supervisor(claims, order).run();

    expect(order).toEqual([
      "claim",
      "providers:2026-07-27",
      "terminal:2026-07-27",
      "claim",
      "terminal:2026-07-28",
      "claim",
    ]);
    expect(result.outcome).toBe("caught_up");
  });

  it("returns pending after seven dates and leaves an eighth for the next invocation", async () => {
    const dates = Array.from({ length: 8 }, (_, index) =>
      `2026-07-${String(20 + index).padStart(2, "0")}`,
    );
    const claims: ReaderSummaryDailyClaimResult[] = [
      ...dates.map((date) => claimed(work(date, "COMPLETED"))),
      { kind: "caught_up", eligibleThrough: "2026-07-28" },
    ];
    const firstOrder: string[] = [];

    const first = await supervisor(claims, firstOrder).run();

    expect(first.outcome).toBe("pending");
    expect(firstOrder).toEqual(dates.slice(0, 7).flatMap((date) => [
      "claim",
      `terminal:${date}`,
    ]));
    expect(claims).toHaveLength(2);
    expect(claims[0]).toMatchObject({
      kind: "claimed",
      work: { requestedUtcDate: dates[7] },
    });

    const secondOrder: string[] = [];
    const second = await supervisor(claims, secondOrder).run();

    expect(second.outcome).toBe("caught_up");
    expect(secondOrder).toEqual([
      "claim",
      `terminal:${dates[7]}`,
      "claim",
    ]);
  });

  it.each([
    [{ kind: "leased", requestedUtcDate: "2026-07-27" } as const, "nothing_eligible"],
    [{ kind: "failed_ambiguous", requestedUtcDate: "2026-07-27" } as const, "blocked"],
  ])("never retries %s", async (claim, outcome) => {
    const order: string[] = [];
    const result = await supervisor([claim], order).run();
    expect(result.outcome).toBe(outcome);
    expect(order).toEqual(["claim"]);
  });

  it("does not call providers or the model for recovery_required", async () => {
    const order: string[] = [];
    const result = await supervisor([{
      kind: "recovery_required",
      nextUnresolvedUtcDate: "2026-07-20",
      eligibleThrough: "2026-07-28",
    }], order).run();
    expect(result.outcome).toBe("blocked");
    expect(order).toEqual(["claim"]);
  });

  it("replays a durable completed receipt with zero provider calls", async () => {
    const order: string[] = [];
    await supervisor([
      claimed(work("2026-07-27", "COMPLETED")),
      { kind: "caught_up", eligibleThrough: "2026-07-27" },
    ], order).run();
    expect(order).toEqual(["claim", "terminal:2026-07-27", "claim"]);
  });

  it("does no provider, generation, or publication work when already caught up", async () => {
    const order: string[] = [];

    const result = await supervisor([
      { kind: "caught_up", eligibleThrough: "2026-07-27" },
    ], order).run();

    expect(result.outcome).toBe("caught_up");
    expect(order).toEqual(["claim"]);
  });

  it("stops on explicit provider deferral without model execution", async () => {
    const order: string[] = [];
    const result = await supervisor([
      claimed(work("2026-07-27", "RESERVED")),
    ], order, true).run();
    expect(result.outcome).toBe("nothing_eligible");
    expect(order).toEqual(["claim", "providers:2026-07-27"]);
  });

  it("fails closed when terminal output advances a concurrent date", async () => {
    const claim = work("2026-07-27", "COMPLETED");
    await expect(new ReaderSummaryDailyCatchUpSupervisor({
      claimOldest: async () => claimed(claim),
      verifyProviders: async () => ({ kind: "authority_verified" }),
      executeClaimed: async () => ({
        kind: "replayed",
        requestedUtcDate: "2026-07-28",
      }),
    }).run()).rejects.toThrow("different requested date");
  });
});

const supervisor = (
  claims: ReaderSummaryDailyClaimResult[],
  order: string[],
  deferred = false,
) => new ReaderSummaryDailyCatchUpSupervisor({
  claimOldest: async () => {
    order.push("claim");
    const claim = claims.shift();
    if (claim === undefined) throw new Error("unexpected claim");
    return claim;
  },
  verifyProviders: async (value) => {
    order.push(`providers:${value.requestedUtcDate}`);
    return deferred
      ? { kind: "provider_deferred", reasonCode: "provider_not_ready" }
      : { kind: "authority_verified" };
  },
  executeClaimed: async (value) => {
    order.push(`terminal:${value.requestedUtcDate}`);
    return { kind: value.modelJobState === "COMPLETED" ? "replayed" : "completed",
      requestedUtcDate: value.requestedUtcDate };
  },
});

const claimed = (value: ReaderSummaryDailyExecutionWork): ReaderSummaryDailyClaimResult =>
  ({ kind: "claimed", work: value });

const work = (
  requestedUtcDate: string,
  modelJobState: ReaderSummaryDailyExecutionWork["modelJobState"],
): ReaderSummaryDailyExecutionWork => ({
  tenantId: "00000000-0000-7000-8000-000000006101",
  workspaceId: "00000000-0000-7000-8000-000000006102",
  requestedUtcDate,
  eligibleThrough: "2026-07-28",
  sourceAuthority: {
    requestedUtcDate,
    ingestionCutoff: "2026-07-29T01:00:00.000Z",
    canonicalBytes: Buffer.from("{}"),
    canonicalSha256: "a".repeat(64),
  },
  modelJob: readerSummaryDailyModelJobIdentity({
    tenantId: "00000000-0000-7000-8000-000000006101",
    workspaceId: "00000000-0000-7000-8000-000000006102",
    requestedUtcDate,
    sourceAuthoritySha256: "a".repeat(64),
  }),
  modelJobState,
  lease: {
    owner: "worker",
    fencingToken: 1n,
    leasedAt: "2026-07-29T01:00:00.000Z",
    expiresAt: "2026-07-29T01:20:00.000Z",
    absoluteExpiresAt: "2026-07-29T08:00:00.000Z",
  },
  ...(modelJobState === "COMPLETED"
    ? { completedResponseBytes: Buffer.from("response"),
        completedReceiptBytes: Buffer.from("receipt") }
    : {}),
});
