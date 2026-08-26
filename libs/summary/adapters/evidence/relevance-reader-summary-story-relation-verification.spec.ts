import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  buildStoryRelationExecutionProof,
  canonicalStoryRelationProofSha256,
  readerSummaryScopeKey,
  storyRelationExecutionRequestId,
  type StoryRelationDecision,
  type StoryRelationDecisionAggregate,
  type StoryRelationExecutionProof,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
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
  it("runs guarded recall with candidate-bound runtime proof", async () => {
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
        executionAttestationSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        normalizedOutputSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        selectedOutputSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        verificationProof: expect.objectContaining({
          candidateProofSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        }),
      }),
    ]);
  });

  it("fails guarded recall closed for a format-only forged proof", async () => {
    const verifier = new FakeVerifier(false, approveAll);
    await expect(run(verifier)).resolves.toEqual({
      pairs: new Set(),
      relations: [],
    });
    expect(verifier.inputs).toHaveLength(1);
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

  it("rejects an omitted decision proof", async () => {
    const verifier = new FakeVerifier(true, approveAll, {} as never);
    await expect(run(verifier)).resolves.toMatchObject({ relations: [] });
  });

  it.each([
    ["candidate swap", (proof: StoryRelationExecutionProof) => rehashProof({
      ...proof,
      candidateBindings: proof.candidateBindings.map((binding, index) =>
        index === 0 ? { ...binding, canonicalPairId: "other-left\u0000other-right" }
          : binding),
    })],
    ["feature digest mutation", (proof: StoryRelationExecutionProof) =>
      rehashProof({ ...proof, candidateBindings: proof.candidateBindings.map(
        (binding, index) => index === 0
          ? { ...binding, featureDigest: sha("f") } : binding) })],
    ["decision mutation", (proof: StoryRelationExecutionProof) =>
      rehashProof({ ...proof, decisionBindings: proof.decisionBindings.map(
        (binding, index) => index === 0 && binding.valid
          ? { ...binding, confidenceScore: 0.98 } : binding) })],
    ["selection mutation", (proof: StoryRelationExecutionProof) =>
      rehashProof({ ...proof, selectionSha256: sha("e") })],
    ["ranking policy mutation", (proof: StoryRelationExecutionProof) =>
      rehashProof({ ...proof, rankingPolicyVersion: "mutated-ranking-policy" })],
    ["execution attestation mutation", (proof: StoryRelationExecutionProof) => {
      const executionAttestation = {
        ...proof.executionAttestation,
        requestId: `${proof.executionAttestation.requestId}:copied`,
      };
      return rehashProof({ ...proof, executionAttestation,
        executionAttestationSha256:
          canonicalStoryRelationProofSha256(executionAttestation) });
    }],
  ] as const)("rejects a rehashed %s", async (_name, mutateProof) => {
    const verifier = new FakeVerifier(true, approveAll, undefined, mutateProof);
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
    ["opposite active acquisition direction", [
      evidence("left", "reddit", "Cursor acquired SpaceX assets in deal"),
      evidence("right", "x-twitter", "SpaceX acquired Cursor assets in deal"),
    ]],
    ["opposite passive acquisition direction", [
      evidence("left", "reddit", "Cursor acquired SpaceX assets in deal"),
      evidence("right", "x-twitter",
        "Cursor assets were acquired by SpaceX in deal"),
    ]],
    ["opposite nominalized acquisition direction", [
      evidence("left", "reddit", "Cursor acquired SpaceX assets in deal"),
      evidence("right", "x-twitter",
        "SpaceX acquisition of Cursor operations"),
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
  private readonly authenticatedProofs = new WeakSet<object>();

  constructor(
    private readonly validProof: boolean,
    private readonly decisions: DecisionFactory,
    private readonly proof?: VerifiedStoryRelationDecisionBatch["proof"],
    private readonly mutateProof?: (
      proof: StoryRelationExecutionProof,
    ) => StoryRelationExecutionProof,
  ) {}

  async verify(input: ReaderSummaryStoryRelationVerifierInput) {
    this.inputs.push(input);
    const decisions = this.decisions(input);
    const proof = this.proof ?? (this.validProof
      ? proofFor(input, decisions)
      : {
          normalizedOutputSha256: sha("a"),
          executionAttestationSha256: sha("b"),
          selectedOutputSha256: sha("c"),
        });
    if (typeof proof === "object" && proof !== null && this.validProof) {
      this.authenticatedProofs.add(proof);
    }
    return {
      verificationLane: input.verificationLane,
      decisions,
      proof: this.mutateProof === undefined || !("proofVersion" in proof)
        ? proof : this.mutateProof(proof),
    };
  }

  authenticatesExecutionProof(proof: unknown): boolean {
    return typeof proof === "object" && proof !== null &&
      this.authenticatedProofs.has(proof);
  }
}

class PendingCertifiedVerifier implements ReaderSummaryStoryRelationVerifierPort {
  readonly inputs: ReaderSummaryStoryRelationVerifierInput[] = [];
  verify(input: ReaderSummaryStoryRelationVerifierInput): Promise<VerifiedStoryRelationDecisionBatch> {
    this.inputs.push(input);
    return new Promise(() => undefined);
  }
  authenticatesExecutionProof(): boolean { return false; }
}

const proofFor = (
  input: ReaderSummaryStoryRelationVerifierInput,
  decisions: readonly StoryRelationDecision[],
) => {
  if (input.verificationLane === "related_topic" ||
      input.proofSelection === undefined) throw new Error("Expected story proof input");
  const requestId = storyRelationExecutionRequestId({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    scopeKey: readerSummaryScopeKey(input.scope),
    requestedAt: input.requestedAt,
    verificationLane: input.verificationLane,
    selection: input.proofSelection,
    candidates: input.candidates,
  });
  const selectedOutputSha256 = canonicalStoryRelationProofSha256({ decisions });
  const executionAttestation = {
    schemaVersion: 1 as const,
    requestId,
    purpose: "social_monitor.reader_summary.verify_story_relations.v2",
    canonicalRequestSha256: canonicalStoryRelationProofSha256({
      requestId, proofSelection: input.proofSelection,
    }),
    provider: "codex" as const,
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    runtimeEngine: "subscription-runtime-cli" as const,
    runtimePackageVersion: "0.1.0-test.1",
    launcherSha256: canonicalStoryRelationProofSha256({ launcher: "test" }),
    selectedOutputKind: "structured_output" as const,
    selectedOutputSha256,
  };
  return buildStoryRelationExecutionProof({
    verificationLane: input.verificationLane,
    promptVersion: "reader_summary.story_relation.agent_runtime.v2",
    selection: input.proofSelection,
    candidates: input.candidates,
    decisions,
    normalizedOutputSha256: canonicalStoryRelationProofSha256(decisions),
    executionAttestation,
    executionAttestationSha256:
      canonicalStoryRelationProofSha256(executionAttestation),
    selectedOutputSha256,
  });
};

const rehashProof = (
  proof: StoryRelationExecutionProof,
): StoryRelationExecutionProof => ({
  ...proof,
  proofSha256: canonicalStoryRelationProofSha256({
    ...proof,
    proofSha256: undefined,
  }),
});

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
