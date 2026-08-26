import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  StoryRelationDecision,
  StoryRelationDecisionAggregate,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../../domain";
import type {
  ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort,
  StoryRankingMetricsPort,
  VerifiedStoryRelationDecisionBatch,
} from "../../ports";
import { NOOP_STORY_RANKING_METRICS } from "../../ports";
import { verifiedReaderSummaryStoryRelations } from
  "./relevance-reader-summary-story-relation-decisions";

const now = new Date("2026-08-20T12:00:00.000Z");
const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-08-20T00:00:00.000Z"),
  endedAt: new Date("2026-08-21T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "2026-08-20",
};

describe("guarded primary story relation verification", () => {
  it("runs guarded recall by default for the certified agent-runtime verifier", async () => {
    const verifier = new FakeVerifier(true, approveAll);
    const result = await run(verifier);

    expect(verifier.inputs.map((input) => input.verificationLane)).toEqual([
      "guarded_recall_primary",
    ]);
    expect(result.relations).toEqual([
      expect.objectContaining({
        canonicalPairId: "cursor-hn\u0000cursor-x",
        confidence: 0.99,
        verificationLane: "guarded_recall_primary",
        candidatePolicyVersion:
          "reader_summary.story_relation.guarded_recall.v1",
        featureDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
        executionAttestationSha256: sha("b"),
        normalizedOutputSha256: sha("a"),
        selectedOutputSha256: sha("c"),
      }),
    ]);
  });

  it("fails guarded recall closed for every non-certified verifier mode", async () => {
    const verifier = new FakeVerifier(false, approveAll);
    await expect(run(verifier)).resolves.toEqual({
      pairs: new Set(),
      relations: [],
    });
    expect(verifier.inputs).toEqual([]);
  });

  it.each([
    ["missing", () => []],
    ["duplicate", (input: ReaderSummaryStoryRelationVerifierInput) => [
      decision(input, true, 0.99), decision(input, true, 0.99),
    ]],
    ["unmatched", () => [{
      leftFeedItemId: "unknown-left", rightFeedItemId: "unknown-right",
      sameStory: true, confidenceScore: 0.99,
    }]],
    ["malformed", () => [{
      leftFeedItemId: "cursor-hn", rightFeedItemId: "cursor-x",
      sameStory: true, confidenceScore: Number.NaN,
    }]],
  ])("fails a %s decision batch closed", async (_name, decisions) => {
    const verifier = new FakeVerifier(true, decisions as DecisionFactory);
    const result = await run(verifier);
    expect(result.relations).toEqual([]);
    expect(result.pairs.size).toBe(0);
  });

  it("rejects guarded approval below 0.98", async () => {
    const verifier = new FakeVerifier(true, (input) =>
      [decision(input, true, 0.979_999)]);
    await expect(run(verifier)).resolves.toMatchObject({ relations: [] });
  });

  it("rejects an unattested decision proof", async () => {
    const verifier = new FakeVerifier(true, approveAll, {
      normalizedOutputSha256: "unattested",
      executionAttestationSha256: sha("b"),
      selectedOutputSha256: sha("c"),
    });
    await expect(run(verifier)).resolves.toMatchObject({ relations: [] });
  });

  it("times out independently and fails closed", async () => {
    const verifier = new PendingCertifiedVerifier();
    const result = await run(verifier, 1);
    expect(result.relations).toEqual([]);
    expect(verifier.inputs).toHaveLength(1);
  });

  it("does not send a speculative watermark question even when forced true", async () => {
    const verifier = new FakeVerifier(true, approveAll);
    const result = await run(verifier, undefined, [
      evidence("question", "reddit",
        "Could Claude Code watermark output happen?",
        "A user asks whether a watermark might appear."),
      evidence("announcement", "x-twitter",
        "Claude Code output watermarked in release",
        "Anthropic confirms the Claude Code watermark release."),
    ]);
    expect(result.relations).toEqual([]);
    expect(verifier.inputs).toEqual([]);
  });

  it("re-runs deterministic gates after an advisory approval", async () => {
    const items = cursorEvidence.map((item) => ({ ...item }));
    const decisionAggregates: StoryRelationDecisionAggregate[] = [];
    const metrics: StoryRankingMetricsPort = {
      recordStoryRanking: () => undefined,
      recordStoryRelationVerification: () => undefined,
      recordStoryRelationDecisionAggregates: (aggregates) =>
        decisionAggregates.push(...aggregates),
    };
    const verifier = new FakeVerifier(true, (input) => {
      items[0]!.title = "Could Claude Code watermark output happen?";
      return approveAll(input);
    });
    const result = await run(verifier, undefined, items, metrics);
    expect(verifier.inputs).toHaveLength(1);
    expect(result.relations).toEqual([]);
    expect(decisionAggregates).toContainEqual(expect.objectContaining({
      disposition: "rejected_deterministic_revalidation",
      candidatePolicyVersion: "reader_summary.story_relation.guarded_recall.v1",
      count: 1,
    }));
  });

  it.each([
    ["broad company topic", [
      evidence("left", "reddit", "Acme AI company technology news"),
      evidence("right", "x-twitter", "Acme AI company update for users"),
    ]],
    ["acquisition rumor", [
      evidence("left", "reddit", "Could Acme acquire Beta in rumored deal?"),
      evidence("right", "x-twitter", "Acme acquired Beta in confirmed deal"),
    ]],
    ["same-author quote reaction", [
      { ...evidence("left", "reddit", "Acme reaction to Platform release"),
        authorHandle: "same-author",
        promotionFacts: { contentKind: "quote", canonicalIdentity: "left",
          safetyValid: true, freshnessValid: true } },
      { ...evidence("right", "x-twitter", "Platform released by Acme today"),
        authorHandle: "same-author" },
    ]],
    ["different event object", [
      evidence("left", "reddit", "Acme acquired Alpha today"),
      evidence("right", "x-twitter", "Acme acquired Beta today"),
    ]],
    ["same-provider aliases", [
      evidence("left", "x-twitter", "Acme released Platform today"),
      evidence("right", "twitter", "Platform released by Acme today"),
    ]],
    ["missing title", [
      evidence("left", "reddit", ""),
      evidence("right", "x-twitter", "Platform released by Acme today"),
    ]],
    ["canonical URL conflict", [
      { ...evidence("left", "reddit", "Acme released Platform today"),
        canonicalUrl: "https://news.example.test/story-a" },
      { ...evidence("right", "x-twitter", "Platform released by Acme today"),
        canonicalUrl: "https://news.example.test/story-b" },
    ]],
    ["negation conflict", [
      evidence("left", "reddit", "Acme did not release Platform"),
      evidence("right", "x-twitter", "Acme released Platform"),
    ]],
    ["version conflict", [
      evidence("left", "reddit", "Acme released Platform 2.0"),
      evidence("right", "x-twitter", "Acme released Platform 3.0"),
    ]],
    ["date conflict", [
      evidence("left", "reddit", "Acme released Platform in 2025"),
      evidence("right", "x-twitter", "Acme released Platform in 2026"),
    ]],
  ] as const)("rejects %s before a force-true verifier can apply it",
    async (_name, items) => {
      const verifier = new FakeVerifier(true, approveAll);
      const result = await run(verifier, undefined, items);
      expect(result.relations).toEqual([]);
      expect(verifier.inputs).toEqual([]);
    });
});

type DecisionFactory = (
  input: ReaderSummaryStoryRelationVerifierInput,
) => readonly StoryRelationDecision[];

class FakeVerifier implements ReaderSummaryStoryRelationVerifierPort {
  readonly inputs: ReaderSummaryStoryRelationVerifierInput[] = [];

  get guardedPrimaryRecallCertification() {
    return this.certified ? "agent_runtime_attested_v1" as const : undefined;
  }

  constructor(
    private readonly certified: boolean,
    private readonly decisions: DecisionFactory,
    private readonly proof: VerifiedStoryRelationDecisionBatch["proof"] = {
      normalizedOutputSha256: sha("a"),
      executionAttestationSha256: sha("b"),
      selectedOutputSha256: sha("c"),
    },
  ) {}

  async verify(input: ReaderSummaryStoryRelationVerifierInput) {
    this.inputs.push(input);
    return {
      verificationLane: input.verificationLane,
      decisions: this.decisions(input),
      proof: this.proof,
    };
  }
}

class PendingCertifiedVerifier implements ReaderSummaryStoryRelationVerifierPort {
  readonly guardedPrimaryRecallCertification = "agent_runtime_attested_v1" as const;
  readonly inputs: ReaderSummaryStoryRelationVerifierInput[] = [];
  verify(input: ReaderSummaryStoryRelationVerifierInput): Promise<VerifiedStoryRelationDecisionBatch> {
    this.inputs.push(input);
    return new Promise(() => undefined);
  }
}

const approveAll: DecisionFactory = (input) => input.candidates.map((candidate) => ({
  leftFeedItemId: candidate.leftFeedItemId,
  rightFeedItemId: candidate.rightFeedItemId,
  sameStory: true,
  confidenceScore: 0.99,
  rationale: "Same concrete event.",
}));

const decision = (
  input: ReaderSummaryStoryRelationVerifierInput,
  sameStory: boolean,
  confidenceScore: number,
): StoryRelationDecision => {
  const candidate = input.candidates[0];
  if (candidate === undefined) throw new Error("Expected guarded candidate");
  return {
    leftFeedItemId: candidate.leftFeedItemId,
    rightFeedItemId: candidate.rightFeedItemId,
    sameStory,
    confidenceScore,
  };
};

const run = (
  verifier: ReaderSummaryStoryRelationVerifierPort,
  guardedRecallTimeoutMs?: number,
  items: readonly SummaryEvidenceItem[] = cursorEvidence,
  metrics: StoryRankingMetricsPort = NOOP_STORY_RANKING_METRICS,
) => verifiedReaderSummaryStoryRelations({
  query: {
    tenantId: tenantId("tenant-guarded-recall"),
    workspaceId: workspaceId("workspace-guarded-recall"),
    scope: { type: "workspace" },
    period,
    maxItems: items.length,
  },
  evidence: items,
  deterministicSelection: selection(items),
  requestedAt: now,
  verifier,
  metrics,
  ...(guardedRecallTimeoutMs === undefined ? {} : { guardedRecallTimeoutMs }),
});

const cursorEvidence = [
  evidence("cursor-hn", "hacker-news", "Cursor deployed at SpaceX latest",
    "An official note contains no copied announcement prose."),
  evidence("cursor-x", "x-twitter", "SpaceX deploying Cursor for engineers",
    "SpaceX confirms the deployment in separate wrapper metadata."),
] as const;

const selection = (
  items: readonly SummaryEvidenceItem[],
): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "story_ranking_v10",
  sourceWindow: {
    windowId: "guarded-window", startedAt: period.startedAt,
    endedAt: period.endedAt,
    selectedFeedItemIds: items.map((item) => item.feedItemId),
    storyClusterIds: items.map((item) => `cluster:${item.feedItemId}`),
  },
  clusters: items.map((item) => ({
    id: `cluster:${item.feedItemId}`,
    storyKey: `story:${item.feedItemId}`,
    representativeFeedItemId: item.feedItemId,
    duplicateFeedItemIds: [], interestIds: [item.interestId],
    providerKeys: [item.providerKey], score: item.score,
    observedAtRange: { startedAt: item.observedAt,
      endedAt: new Date(item.observedAt.getTime() + 1) },
    whyImportant: [],
  })),
  selectedEvidence: items,
});

function evidence(
  feedItemId: string,
  providerKey: string,
  title: string,
  bodyPreview?: string,
): SummaryEvidenceItem {
  return {
    feedItemId, providerKey, title, bodyPreview,
    sourceItemId: `source:${feedItemId}`,
    sourceBindingId: `binding:${feedItemId}`,
    interestId: "interest-ai",
    canonicalUrl: `https://${providerKey}.example.test/${feedItemId}`,
    publishedAt: now,
    observedAt: now,
    score: 2,
    whyImportant: [],
  };
}

const sha = (character: string): string => character.repeat(64);
