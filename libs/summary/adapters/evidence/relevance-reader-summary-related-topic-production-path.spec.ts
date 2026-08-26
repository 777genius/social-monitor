import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import { canonicalJsonSha256 } from
  "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import { ok, tenantId, workspaceId, type Clock } from "@social-monitor/shared-kernel";

import { aug14RelatedTopicEvidence } from "../../test-fixtures/aug-14-related-topic.fixture";
import type {
  ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort,
  VerifiedStoryRelationDecisionBatch,
} from "../../ports";
import { RelevanceReaderSummaryEvidenceSelector } from "./relevance-reader-summary-evidence.selector";

describe("RelevanceReaderSummaryEvidenceSelector related-topic production path", () => {
  it("changes only the optional relation output when the verdict lane is enabled", async () => {
    const disabled = await selectWithRelationVerdict("unrelated", rankedEvidence());
    const enabled = await selectWithRelationVerdict("related_topic", rankedEvidence());

    expect(enabled.relatedTopicRelations).toHaveLength(1);
    expect(enabled.relatedTopicRelations?.[0]).toMatchObject({
      subjectFeedItemId: "aug14-watermark-reddit",
      subjectProviderKey: "reddit",
      subjectSourceItemId: "reddit-1mt-watermark-code",
      officialAnchorFeedItemId: "aug14-watermark-official",
      officialAnchorProviderKey: "rss",
      officialAnchorSourceItemId: "anthropic-text-watermarking",
      officialAnchorContentQuality: expect.objectContaining({
        eligibleForTopRead: true,
        flags: expect.arrayContaining(["official_account", "trusted_author"]),
      }),
      subjectIsOfficial: false,
      officialAnchorIsOfficial: true,
    });
    expect(withoutRelations(enabled)).toEqual(withoutRelations(disabled));
    expect(enabled.clusters).toEqual(disabled.clusters);
    expect(enabled.selectedEvidence).toEqual(disabled.selectedEvidence);
    expect(enabled.rankingPolicyVersion).toBe(disabled.rankingPolicyVersion);
  });

  it("is input-permutation stable and fails malformed or duplicate verdicts closed", async () => {
    const expected = await selectWithRelationVerdict(
      "related_topic",
      rankedEvidence(),
    );
    const permuted = await selectWithRelationVerdict(
      "related_topic",
      [...rankedEvidence()].reverse(),
    );
    expect(permuted.relatedTopicRelations).toEqual(expected.relatedTopicRelations);

    for (const mode of ["malformed", "duplicate"] as const) {
      const selection = await selectWithVerifier(new ProductionPathVerifier(mode));
      expect(selection.relatedTopicRelations).toEqual([]);
      expect(withoutRelations(selection)).toEqual(withoutRelations(expected));
    }
  });

  it("times out through select and preserves the complete non-related selection", async () => {
    const verifier = new ProductionPathVerifier("timeout");
    const timedOut = await selectWithVerifier(verifier, rankedEvidence(), 1);
    const disabled = await selectWithRelationVerdict("unrelated", rankedEvidence());

    expect(timedOut.relatedTopicRelations).toEqual([]);
    expect(verifier.relatedSignal?.aborted).toBe(true);
    expect(withoutRelations(timedOut)).toEqual(withoutRelations(disabled));
  });
});

const now = new Date("2026-08-14T18:00:00.000Z");
const clock: Clock = { now: () => now };

const selectWithRelationVerdict = (
  verdict: "related_topic" | "unrelated",
  items: readonly RankedFeedItemView[],
) => selectWithVerifier(new ProductionPathVerifier(verdict), items);

const selectWithVerifier = (
  verifier: ReaderSummaryStoryRelationVerifierPort,
  items: readonly RankedFeedItemView[] = rankedEvidence(),
  relatedTopicTimeoutMs?: number,
) => new RelevanceReaderSummaryEvidenceSelector(
  ranker(items),
  emptyFeedRepository(),
  clock,
  undefined,
  verifier,
  relatedTopicTimeoutMs,
).select({
  tenantId: tenantId("tenant-aug14-production"),
  workspaceId: workspaceId("workspace-aug14-production"),
  scope: { type: "workspace" },
  period: {
    cadence: "daily",
    startedAt: new Date("2026-08-14T00:00:00.000Z"),
    endedAt: new Date("2026-08-15T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "2026-08-14",
  },
  maxItems: 3,
  observedThrough: now,
});

class ProductionPathVerifier implements ReaderSummaryStoryRelationVerifierPort {
  constructor(
    private readonly mode:
      | "related_topic"
      | "unrelated"
      | "malformed"
      | "duplicate"
      | "timeout",
  ) {}

  relatedSignal?: AbortSignal;

  async verify(
    input: ReaderSummaryStoryRelationVerifierInput,
  ): Promise<VerifiedStoryRelationDecisionBatch> {
    if (input.verificationLane !== "related_topic") {
      return {
        verificationLane: input.verificationLane,
        decisions: input.candidates.map((candidate) => ({
          leftFeedItemId: candidate.leftFeedItemId,
          rightFeedItemId: candidate.rightFeedItemId,
          sameStory: officialAndNewsPair(candidate.leftFeedItemId, candidate.rightFeedItemId),
          confidenceScore: 0.99,
        })),
        proof: verifiedProof,
      };
    }
    this.relatedSignal = input.signal;
    if (this.mode === "timeout") {
      return new Promise<VerifiedStoryRelationDecisionBatch>(() => undefined);
    }
    if (this.mode === "malformed") return {
      verificationLane: input.verificationLane,
      decisions: [{ unexpected: true }] as never,
      proof: verifiedProof,
    };
    const relation: "unrelated" | "related_topic" =
      this.mode === "unrelated" ? "unrelated" : "related_topic";
    const decisions = input.candidates.map((candidate) => ({
      leftFeedItemId: candidate.leftFeedItemId,
      rightFeedItemId: candidate.rightFeedItemId,
      relation,
      confidenceScore: 0.99,
    }));
    return {
      verificationLane: input.verificationLane,
      decisions: this.mode === "duplicate" ? [...decisions, ...decisions] : decisions,
      proof: verifiedProof,
    };
  }

  authenticatesExecutionProof(): boolean { return false; }
}

const verifiedProof = {
  normalizedOutputSha256: canonicalJsonSha256({ fixture: "normalized-output" }),
  executionAttestationSha256: canonicalJsonSha256({
    fixture: "execution-attestation",
  }),
  selectedOutputSha256: canonicalJsonSha256({ fixture: "selected-output" }),
};

const officialAndNewsPair = (left: string, right: string): boolean =>
  new Set([left, right]).size === 2 &&
  [left, right].includes("aug14-watermark-official") &&
  [left, right].includes("aug14-watermark-hn");

const ranker = (items: readonly RankedFeedItemView[]): RankFeedItemsUseCase => ({
  execute: async () => ok({
    generatedAt: now.toISOString(),
    profileApplied: false,
    items,
  }),
}) as unknown as RankFeedItemsUseCase;

const emptyFeedRepository = (): FeedItemReadRepositoryPort => ({
  readPromotionSnapshot: async () => ({
    ok: true,
    candidates: [],
    sourceContent: [],
    physicalRowsRead: 0,
    exhausted: true,
  }),
  list: async () => ({ items: [] }),
  findById: async () => null,
});

const rankedEvidence = (): readonly RankedFeedItemView[] =>
  aug14RelatedTopicEvidence().map((item, index) => ({
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    sourceBindingId: item.sourceBindingId,
    interestId: item.interestId,
    providerKey: item.providerKey,
    canonicalUrl: item.canonicalUrl,
    title: item.title,
    bodyPreview: item.bodyPreview,
    publishedAt: item.publishedAt.toISOString(),
    observedAt: item.observedAt.toISOString(),
    score: item.score,
    rank: index + 1,
    clusterId: `source:${item.providerKey}:${item.sourceItemId}`,
    clusterSize: 1,
    duplicateFeedItemIds: [],
    whyImportant: item.whyImportant,
    contentQuality: {
      ...item.contentQuality!,
      decision: item.contentQuality!.decision === "promote"
        ? "promote" as const
        : "keep" as const,
    },
    safety: {
      status: "allowed",
      categories: ["raw_payload_retention_disabled"],
      rawPayloadRetained: false,
      retentionPolicy: "normalized_preview_only",
    },
  }));

const withoutRelations = <T extends { readonly relatedTopicRelations?: unknown }>(
  selection: T,
) => {
  const { relatedTopicRelations: ignored, ...rest } = selection;
  void ignored;
  return rest;
};
