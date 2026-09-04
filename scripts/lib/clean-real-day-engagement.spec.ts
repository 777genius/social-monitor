import { CircuitBreakerSourceFetcherAdapter } from
  "@social-monitor/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter";
import { SystemClock } from "@social-monitor/shared-kernel";
import type { GitHubTrendingDurableSnapshotReader } from
  "./github-trending-durable-snapshot-reuse";
import { executeCleanRealDayProviderAcquisition, type CleanRealDaySourceBindingTarget } from
  "./clean-real-day-provider-acquisition";
import { AcquisitionDatabaseFixture } from "./clean-real-day-engagement.spec-support";

describe("live acquisition durable engagement composition", () => {
  let db: AcquisitionDatabaseFixture;
  let score: number;
  let now: Date;
  beforeEach(() => {
    db = new AcquisitionDatabaseFixture();
    score = 42;
    now = new Date("2026-09-04T12:00:00.000Z");
    jest.spyOn(SystemClock.prototype, "now").mockImplementation(() => new Date(now));
    jest.spyOn(CircuitBreakerSourceFetcherAdapter.prototype, "fetch")
      .mockImplementation(async () => ({
        items: [{
          externalId: "reddit:test-engagement",
          canonicalUrl: "https://example.test/reddit/engagement",
          title: "A relevant AI research result", body: "Sandbox source evidence.",
          publishedAt: new Date("2026-09-04T11:00:00.000Z"),
          metadata: { kind: "reddit_post", providerScore: score, subreddit: "sandbox" },
        }],
      }));
  });
  afterEach(() => jest.restoreAllMocks());

  const run = () => executeCleanRealDayProviderAcquisition({
    targets: [target], connection: db.connection,
    durableSnapshotReader: {} as GitHubTrendingDurableSnapshotReader,
    requestedUtcDay: "2026-09-04", targetWindowEndedAt: new Date("2026-09-05T00:00:00Z"),
    runStartedAt: now, waitForXReadiness: false,
  });

  it("writes source-bound snapshots and observations through the real composition", async () => {
    const results = await run();
    expect(db.rows("scanAttempt").map((row) => row.failureReason).filter(Boolean)).toEqual([]);
    expect(results[0]?.status).toBe("succeeded");
    const source = db.rows("sourceItem")[0]!;
    expect(db.rows("sourceItemEngagementSnapshot")).toEqual([
      expect.objectContaining({
        tenantId: target.tenantId, workspaceId: target.workspaceId,
        sourceItemId: source.id, providerKey: "reddit", score: 42n,
      }),
    ]);
    expect(db.rows("sourceItemEngagementObservation")[0]).toMatchObject({
      tenantId: target.tenantId, workspaceId: target.workspaceId,
      sourceItemId: source.id, sourceBindingId: target.sourceBindingId,
      providerKey: "reddit", score: 42n,
    });
    expect(db.accesses.length).toBeGreaterThan(0);
    expect(db.accesses.every((access) => access?.kind === "tenant" &&
      access.tenantId === target.tenantId && access.workspaceId === target.workspaceId)).toBe(true);
  });

  it("refreshes a duplicate from fresh provider metrics without inserting another post", async () => {
    await run();
    score = 90;
    now = new Date("2026-09-04T16:00:00.000Z");
    await run();
    expect(db.rows("sourceItem")).toHaveLength(1);
    expect(db.rows("feedItem")).toHaveLength(1);
    expect(db.rows("sourceItemEngagementSnapshot")[0]).toMatchObject({
      score: 90n, lastObservedAt: now,
    });
    expect(db.rows("feedItem")[0]?.providerMetadata).toMatchObject({ providerScore: 90 });
  });

  it("reports failed collection when durable engagement cannot be persisted", async () => {
    db.failSnapshots = true;
    const results = await run();
    expect(results[0]?.status).toBe("failed");
    expect(db.rows("sourceItemEngagementSnapshot")).toEqual([]);
    expect(db.rows("sourceItemEngagementObservation")).toEqual([]);
    expect(db.rows("scanAttempt").every((row) => row.status === "FAILED")).toBe(true);
  });
});

const target: CleanRealDaySourceBindingTarget = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  interestId: "33333333-3333-4333-8333-333333333333", interestQuery: "AI research",
  sourceBindingId: "44444444-4444-4444-8444-444444444444",
  scanPolicyId: "55555555-5555-4555-8555-555555555555",
  providerKey: "reddit", config: { mode: "search", limit: 1 },
  sourceQuery: { mode: "search", query: "AI research" },
};
