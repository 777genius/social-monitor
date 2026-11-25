import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import {
  buildStoryRelationCandidates,
  buildBoundedStrictTitleStoryRelationCandidates,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "../../domain";
import {
  InvalidStoryRelationDecisionBatchError,
  NOOP_STORY_RANKING_METRICS,
  type ReaderSummaryStoryRelationVerifierInput,
  type StoryRankingMetricsPort,
} from "../../ports";
import { observeSafeRecallShadow } from "./relevance-reader-summary-story-relation-decisions";

const shadowPolicy = "reader_summary.story_relation.safe_recall_shadow.v2";
const reason = "title_normalized_entity_event_evidence";
const pairId = "synthetic-announcement\u0000synthetic-discussion";
const rationale = "SYNTHETIC private verifier explanation";
const decision = { leftFeedItemId: "synthetic-announcement",
  rightFeedItemId: "synthetic-discussion", sameStory: true,
  confidenceScore: 0.99, rationale };

// Separate clusters, different providers, normalized title event, unrelated bodies:
// eligible for shadow, absent from the supplied authoritative primary shortlist.
const fixture = () => {
  const requestedAt = new Date("2026-08-15T12:00:00.000Z");
  const evidence = [
    ["synthetic-announcement", "rss", "Cursor deployed at SpaceX", "SYNTHETIC orchard"],
    ["synthetic-discussion", "hacker-news", "SpaceX deploying Cursor", "SYNTHETIC pottery"],
  ] as const;
  const items: SummaryEvidenceItem[] = evidence.map(([id, providerKey, title, bodyPreview]) => ({
    feedItemId: id, sourceItemId: `synthetic-source:${id}`,
    sourceBindingId: `synthetic-binding:${id}`, interestId: "synthetic-interest",
    providerKey, title, bodyPreview,
    canonicalUrl: `https://synthetic.example.test/${id}`,
    publishedAt: requestedAt, observedAt: requestedAt, score: 1,
    whyImportant: ["SYNTHETIC contract fixture"],
  }));
  const deterministicSelection: SummaryEvidenceSelection = {
    rankingPolicyVersion: "synthetic-ranking-v1", selectedEvidence: items,
    sourceWindow: {
      windowId: "synthetic-window", startedAt: requestedAt, endedAt: requestedAt,
      selectedFeedItemIds: items.map((item) => item.feedItemId),
      storyClusterIds: items.map((item) => `story:${item.feedItemId}`),
    },
    clusters: items.map((item) => ({
      id: `story:${item.feedItemId}`, storyKey: item.feedItemId,
      representativeFeedItemId: item.feedItemId, duplicateFeedItemIds: [],
      interestIds: [item.interestId], providerKeys: [item.providerKey], score: 1,
      observedAtRange: { startedAt: requestedAt, endedAt: requestedAt },
      whyImportant: item.whyImportant,
    })),
  };
  return { requestedAt, evidence: items, deterministicSelection,
    primaryCandidates: buildStoryRelationCandidates({
      selection: deterministicSelection, evidence: items,
    }),
    query: {
      tenantId: tenantId("synthetic-tenant"), workspaceId: workspaceId("synthetic-workspace"),
      scope: { type: "workspace" as const }, maxItems: 2,
      period: { cadence: "daily" as const, timezone: "UTC", periodKey: "2026-08-15",
        startedAt: new Date("2026-08-15T00:00:00.000Z"),
        endedAt: new Date("2026-08-16T00:00:00.000Z") },
    },
  };
};

const capturingMetrics = () => ({
  recordStoryRanking: jest.fn(), recordStoryRelationVerification: jest.fn(),
  recordStoryRelationSafeRecallShadowGeneration: jest.fn(),
  recordStoryRelationSafeRecallShadowDecisions: jest.fn(),
});
const aggregate = (disposition: string, failureReason?: string) => ({
  shadowReasonCode: reason, disposition, rankingPolicyVersion: "synthetic-ranking-v1",
  candidatePolicyVersion: shadowPolicy, count: 1,
  ...(failureReason === undefined ? {} : { failureReason }),
});

describe("awaited safe-recall shadow observation contract", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // Red if the lane/bound/scope changes, completion is detached, approvals apply,
  // telemetry leaks identities/text, or the successful deadline is left armed.
  it("awaits a real eligible pair and reports approval only as private shadow evidence", async () => {
    const params = fixture();
    const before = JSON.stringify(params);
    const metrics = capturingMetrics();
    let input!: ReaderSummaryStoryRelationVerifierInput;
    let finish!: (decisions: readonly unknown[]) => void;
    const pending = observeSafeRecallShadow({ ...params, metrics,
      verifier: { verify: (received) => {
        input = received;
        return new Promise((resolve) => { finish = resolve; });
      } },
    });
    expect(params.primaryCandidates).toEqual([]);
    expect(input).toMatchObject({ tenantId: params.query.tenantId,
      workspaceId: params.query.workspaceId, scope: params.query.scope,
      period: params.query.period, requestedAt: params.requestedAt,
      evidence: params.evidence, clusters: params.deterministicSelection.clusters,
      verificationLane: "safe_recall_shadow", timeoutMs: 30_000 });
    expect(input.signal).toBeInstanceOf(AbortSignal);
    expect(input.signal?.aborted).toBe(false);
    expect(input.candidates).toEqual([expect.objectContaining({
      leftFeedItemId: decision.leftFeedItemId, rightFeedItemId: decision.rightFeedItemId,
      shadowReasonCode: reason, titleSharedIdentityTokenCount: 2,
      titleSharedEventTokenCount: 1,
    })]);
    expect(metrics.recordStoryRelationSafeRecallShadowDecisions).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(1);
    finish([decision]);
    const traces = await pending;
    expect(traces).toEqual([expect.objectContaining({ pairId,
      disposition: "approved", wouldApprove: true, applied: false,
      confidenceScore: 0.99, rationalePresent: true,
      rationaleCharacterCount: rationale.length, shadowReasonCode: reason,
      candidatePolicyVersion: shadowPolicy, rankingPolicyVersion: "synthetic-ranking-v1",
    })]);
    expect(JSON.stringify(traces)).not.toContain(rationale);
    // Exact aggregate schemas reject extra pair/source/title/body/rationale fields.
    expect(metrics.recordStoryRelationSafeRecallShadowGeneration.mock.calls).toEqual([[[{
      reasonCode: reason, candidatePolicyVersion: shadowPolicy, count: 1,
    }]]]);
    expect(metrics.recordStoryRelationSafeRecallShadowDecisions.mock.calls).toEqual([
      [[aggregate("approved")]],
    ]);
    expect(metrics.recordStoryRanking).not.toHaveBeenCalled();
    expect(metrics.recordStoryRelationVerification).not.toHaveBeenCalled();
    expect(JSON.stringify(params)).toBe(before);
    expect(jest.getTimerCount()).toBe(0);
    expect(input.signal?.aborted).toBe(false);
  });

  // Red if an already authoritative strict-title pair is reverified in shadow.
  it("excludes an authoritative pair before starting verification", async () => {
    const params = fixture();
    const primaryCandidates = buildBoundedStrictTitleStoryRelationCandidates({
      selection: params.deterministicSelection, evidence: params.evidence,
      primaryCandidates: params.primaryCandidates,
    });
    expect(primaryCandidates).toHaveLength(1);
    const verify = jest.fn(async () => [decision]);
    expect(await observeSafeRecallShadow({ ...params, primaryCandidates,
      metrics: NOOP_STORY_RANKING_METRICS, verifier: { verify } })).toEqual([]);
    expect(verify).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  // Red if absence of a verifier silently drops an eligible pair or applies it.
  // The default NOOP metrics participate in both generation and terminal observation.
  it("returns unavailable traces with genuine default NOOP telemetry", async () => {
    const traces = await observeSafeRecallShadow({ ...fixture(),
      metrics: NOOP_STORY_RANKING_METRICS });
    expect(traces).toEqual([expect.objectContaining({ pairId,
      disposition: "verifier_unavailable", wouldApprove: false, applied: false })]);
    expect(jest.getTimerCount()).toBe(0);
  });

  // Red if rejected promises escape, typed envelope failures lose their reason,
  // or an invalid confidence is accepted instead of failing closed.
  it.each([
    ["exception", async () => { throw new Error("SYNTHETIC verifier failure"); }, "verifier_exception"],
    ["invalid envelope", async () => {
      throw new InvalidStoryRelationDecisionBatchError("envelope_missing_decisions");
    }, "envelope_missing_decisions"],
    ["invalid decision", async () => [{ ...decision, confidenceScore: 2 }], "decision_confidence_out_of_range"],
  ] as const)("fails closed on %s and clears its timer", async (_name, verify, failureReason) => {
    const metrics = capturingMetrics();
    const traces = await observeSafeRecallShadow({ ...fixture(), metrics, verifier: { verify } });
    expect(traces).toEqual([expect.objectContaining({ pairId,
      disposition: "verifier_failed_closed", failureReason, wouldApprove: false, applied: false })]);
    expect(metrics.recordStoryRelationSafeRecallShadowDecisions.mock.calls).toEqual([
      [[aggregate("verifier_failed_closed", failureReason)]],
    ]);
    expect(jest.getTimerCount()).toBe(0);
  });

  // Red if a pending verifier is not aborted at the caller's bound, or a late
  // approval replaces the terminal fail-closed observation/records a second metric.
  it("aborts at the independent deadline and ignores late approval", async () => {
    const metrics = capturingMetrics();
    let input!: ReaderSummaryStoryRelationVerifierInput;
    let finish!: (decisions: readonly unknown[]) => void;
    const pending = observeSafeRecallShadow({ ...fixture(), metrics, timeoutMs: 17,
      verifier: { verify: (received) => {
        input = received;
        return new Promise((resolve) => { finish = resolve; });
      } },
    });
    expect(input.timeoutMs).toBe(17);
    await jest.advanceTimersByTimeAsync(16);
    expect(input.signal?.aborted).toBe(false);
    expect(metrics.recordStoryRelationSafeRecallShadowDecisions).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    const traces = await pending;
    expect(input.signal?.aborted).toBe(true);
    expect(traces).toEqual([expect.objectContaining({ pairId,
      disposition: "verifier_failed_closed", failureReason: "verifier_exception",
      wouldApprove: false, applied: false })]);
    expect(jest.getTimerCount()).toBe(0);
    finish([decision]);
    await jest.advanceTimersByTimeAsync(0);
    expect(metrics.recordStoryRelationSafeRecallShadowDecisions.mock.calls).toEqual([
      [[aggregate("verifier_failed_closed", "verifier_exception")]],
    ]);
    expect(await pending).toEqual(traces);
  });

  // Red if observability errors turn a valid shadow approval into failure.
  it("preserves decisions when aggregate telemetry throws", async () => {
    const fail = () => { throw new Error("SYNTHETIC metrics failure"); };
    const metrics: StoryRankingMetricsPort = { ...NOOP_STORY_RANKING_METRICS,
      recordStoryRelationSafeRecallShadowGeneration: fail,
      recordStoryRelationSafeRecallShadowDecisions: fail };
    const traces = await observeSafeRecallShadow({ ...fixture(), metrics,
      verifier: { verify: async () => [decision] } });
    expect(traces).toEqual([expect.objectContaining({ pairId,
      disposition: "approved", wouldApprove: true, applied: false })]);
    expect(jest.getTimerCount()).toBe(0);
  });
});
