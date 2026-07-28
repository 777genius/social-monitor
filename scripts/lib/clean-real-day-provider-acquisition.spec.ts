import {
  currentDatabaseAccess,
  type DatabaseAccess,
} from "@social-monitor/platform-persistence";

import type { CleanRealDayCollectionReport } from "./clean-real-day-collection-report";
import {
  cleanRealDayFeedProjectionClient,
  requestedUtcDayIsClosed,
  runCleanRealDayProviderAcquisitionPlan,
  runCleanRealDayLiveTargetWithDatabaseAccess,
  type CleanRealDaySourceBindingTarget,
} from "./clean-real-day-provider-acquisition";
import {
  durableSnapshotReuseProviderCollectionObservation,
  successfulProviderCollectionObservation,
  unavailableProviderCollectionObservation,
} from "./provider-collection-observability";
import {
  discoverSingleScopeCleanRealDayTargets,
} from "../run-reader-summary-clean-real-day-collection";

describe("clean real-day provider acquisition", () => {
  it("switches GitHub to reuse exactly when the requested UTC day closes", () => {
    const endedAt = new Date("2026-07-24T00:00:00.000Z");

    expect(
      requestedUtcDayIsClosed(
        new Date("2026-07-23T23:59:59.999Z"),
        endedAt,
      ),
    ).toBe(false);
    expect(requestedUtcDayIsClosed(new Date(endedAt), endedAt)).toBe(true);
  });

  it("uses one network-free durable read for closed-day GitHub with no retry", async () => {
    const targets = [target("github-trending-page"), target("hacker-news")];
    const collectLive = jest.fn(async (item: Target) => liveScan(item, 10));
    const collectDurableSnapshot = jest.fn(async () => durableScan());

    const scans = await runCleanRealDayProviderAcquisitionPlan({
      targets,
      closedRequestedUtcDay: true,
      collectLive,
      collectDurableSnapshot,
      waitForXReadiness: false,
    });

    expect(collectDurableSnapshot).toHaveBeenCalledTimes(1);
    expect(collectLive).toHaveBeenCalledTimes(1);
    expect(collectLive.mock.calls[0]?.[0].providerKey).toBe("hacker-news");
    expect(scans.find(isGitHubScan)).toMatchObject({
      acquisitionMode: "durable_snapshot_reuse",
      attemptCount: 1,
      fetched: 0,
      inserted: 0,
      projected: 0,
    });
  });

  it("does not retry an invalid closed-day durable snapshot", async () => {
    const collectLive = jest.fn(async (item: Target) => liveScan(item, 10));
    const collectDurableSnapshot = jest.fn(async () => failedDurableScan());

    const scans = await runCleanRealDayProviderAcquisitionPlan({
      targets: [target("github-trending-page")],
      closedRequestedUtcDay: true,
      collectLive,
      collectDurableSnapshot,
      waitForXReadiness: false,
    });

    expect(collectLive).not.toHaveBeenCalled();
    expect(collectDurableSnapshot).toHaveBeenCalledTimes(1);
    expect(scans[0]).toMatchObject({
      status: "failed",
      acquisitionMode: "durable_snapshot_reuse",
      attemptCount: 1,
    });
  });

  it("keeps current-day GitHub on the explicit live path", async () => {
    const collectLive = jest.fn(async (item: Target) => liveScan(item, 10));
    const collectDurableSnapshot = jest.fn(async () => durableScan());

    const scans = await runCleanRealDayProviderAcquisitionPlan({
      targets: [target("github-trending-page")],
      closedRequestedUtcDay: false,
      collectLive,
      collectDurableSnapshot,
      waitForXReadiness: false,
    });

    expect(collectLive).toHaveBeenCalledTimes(1);
    expect(collectDurableSnapshot).not.toHaveBeenCalled();
    expect(scans[0]).toMatchObject({
      acquisitionMode: "live_collection",
      attemptCount: 1,
    });
  });

  it("leaves non-GitHub live retry behavior unchanged", async () => {
    let attempt = 0;
    const collectLive = jest.fn(async (item: Target) => {
      attempt += 1;
      return liveScan(item, attempt === 3 ? 10 : 1);
    });

    const scans = await runCleanRealDayProviderAcquisitionPlan({
      targets: [target("hacker-news")],
      closedRequestedUtcDay: true,
      collectLive,
      collectDurableSnapshot: jest.fn(async () => durableScan()),
      waitForXReadiness: false,
    });

    expect(collectLive).toHaveBeenCalledTimes(3);
    expect(scans[0]).toMatchObject({
      providerKey: "hacker-news",
      acquisitionMode: "live_collection",
      attemptCount: 3,
    });
  });

  it("runs live acquisition inside its DB-derived tenant workspace access", async () => {
    const scope = {
      tenantId: "93d91443-5598-4f2e-baa5-a85cbe30b9c4",
      workspaceId: "2b61fe09-5f67-4e34-874d-7e92210d73aa",
    };
    let observedAccess: ReturnType<typeof currentDatabaseAccess>;

    await runCleanRealDayLiveTargetWithDatabaseAccess(scope, async () => {
      observedAccess = currentDatabaseAccess();
    });

    expect(observedAccess).toEqual({ kind: "tenant", ...scope });
    expect(currentDatabaseAccess()).toBeUndefined();
  });

  it("discovers targets with explicit system database access", async () => {
    let observedAccess: DatabaseAccess | undefined;
    const targets = [target("hacker-news")];

    await expect(
      discoverSingleScopeCleanRealDayTargets(async () => {
        observedAccess = currentDatabaseAccess();
        return targets;
      }),
    ).resolves.toBe(targets);

    expect(observedAccess).toEqual({
      kind: "system",
      reason: "clean real-day enabled provider target discovery",
    });
    expect(currentDatabaseAccess()).toBeUndefined();
  });

  it.each(["no", "multiple"] as const)(
    "fails closed before acquisition when discovery returns $label scope",
    async (label) => {
      const targets =
        label === "no"
          ? []
          : [
              target("hacker-news"),
              {
                ...target("reddit"),
                workspaceId: "workspace-b",
              },
            ];
      const acquireLive = jest.fn();

      await expect(
        discoverSingleScopeCleanRealDayTargets(async () => targets).then(
          acquireLive,
        ),
      ).rejects.toThrow(
        `expected exactly one tenant/workspace scope, found ${
          targets.length === 0 ? 0 : 2
        }`,
      );
      expect(acquireLive).not.toHaveBeenCalled();
    },
  );

  it("accepts multiple enabled targets in one tenant workspace scope", async () => {
    const targets = [target("hacker-news"), target("reddit")];

    await expect(
      discoverSingleScopeCleanRealDayTargets(async () => targets),
    ).resolves.toBe(targets);
  });

  it("extends the feed projection transaction budget for 100-item writes", async () => {
    const transaction = jest.fn().mockResolvedValue("complete");
    const client = cleanRealDayFeedProjectionClient({
      feedItem: {} as never,
      feedSignalBaselineSample: {} as never,
      $transaction: transaction as never,
    });

    await client.$transaction(async () => "complete", {
      isolationLevel: "Serializable",
    });

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 30_000,
      timeout: 300_000,
    });
  });
});

type Target = CleanRealDaySourceBindingTarget;
type PlannedScan = Omit<
  CleanRealDayCollectionReport["scans"][number],
  "attemptCount"
>;

const isGitHubScan = (
  scan: CleanRealDayCollectionReport["scans"][number],
): boolean => scan.providerKey === "github-trending-page";

const target = (
  providerKey: Target["providerKey"],
): CleanRealDaySourceBindingTarget => ({
  tenantId: "tenant-a",
  workspaceId: "workspace-a",
  interestId: `interest-${providerKey}`,
  interestQuery: providerKey,
  sourceBindingId: `binding-${providerKey}`,
  scanPolicyId: `policy-${providerKey}`,
  providerKey,
  config: { maxItems: 10 },
  sourceQuery: {
    mode: providerKey === "github-trending-page" ? "listing" : "search",
    query: providerKey,
  },
});

const liveScan = (target: Target, accepted: number): PlannedScan => ({
  providerKey: target.providerKey,
  bindingFingerprint: "binding",
  acquisitionMode: "live_collection",
  status: "succeeded",
  fetched: accepted,
  inserted: accepted,
  projected: accepted,
  skippedDuplicates: 0,
  warningCount: 0,
  observability: successfulProviderCollectionObservation({
    telemetry: {
      targetItemCount: 10,
      collectedItemCount: accepted,
      acceptedItemCount: accepted,
      outsideWindowItemCount: 0,
      pageCount: 1,
      paginationDuplicateItemCount: 0,
      paginationStopReason: "target_items",
      rateLimitEventCount: 0,
      oldestAcceptedPublishedAt: new Date("2026-07-23T23:58:00.000Z"),
      newestAcceptedPublishedAt: new Date("2026-07-23T23:59:00.000Z"),
    },
    fetched: accepted,
    inserted: accepted,
    storageDuplicates: 0,
    targetWindowEndedAt: new Date("2026-07-24T00:00:00.000Z"),
  }),
});

const durableScan = (): PlannedScan => ({
  providerKey: "github-trending-page",
  bindingFingerprint: "binding",
  acquisitionMode: "durable_snapshot_reuse",
  status: "succeeded",
  fetched: 0,
  inserted: 0,
  projected: 0,
  skippedDuplicates: 0,
  warningCount: 0,
  observability: durableSnapshotReuseProviderCollectionObservation({
    itemCount: 10,
    newestPublishedAt: new Date("2026-07-23T23:59:00.000Z"),
    targetWindowEndedAt: new Date("2026-07-24T00:00:00.000Z"),
  }),
});

const failedDurableScan = (): PlannedScan => ({
  providerKey: "github-trending-page",
  bindingFingerprint: "binding",
  acquisitionMode: "durable_snapshot_reuse",
  status: "failed",
  fetched: 0,
  inserted: 0,
  projected: 0,
  skippedDuplicates: 0,
  warningCount: 0,
  observability: unavailableProviderCollectionObservation({
    targetItemCount: 10,
    status: "failed",
    acquisitionMode: "durable_snapshot_reuse",
    targetWindowEndedAt: new Date("2026-07-24T00:00:00.000Z"),
  }),
  failureFingerprint: "failure",
});
