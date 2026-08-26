import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  aug14RelatedTopicSelection,
  AUG_14_WATERMARK_REDDIT_TITLE,
} from "../../test-fixtures/aug-14-related-topic.fixture";
import type {
  ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort,
  RelatedTopicVerificationMetric,
  StoryRankingMetricsPort,
  VerifiedStoryRelationDecisionBatch,
} from "../../ports";
import { verifiedReaderSummaryRelatedTopics } from "./relevance-reader-summary-related-topics";

describe("verifiedReaderSummaryRelatedTopics", () => {
  it("runs only on the final selection and cannot promote or recluster evidence", async () => {
    const selection = aug14RelatedTopicSelection();
    const original = structuredClone(selection);
    const verifier = new ExplicitRelatedTopicVerifier();
    const relations = await verifiedReaderSummaryRelatedTopics({
      query: {
        tenantId: tenantId("tenant-aug14"),
        workspaceId: workspaceId("workspace-aug14"),
        userId: "user-aug14",
        scope: { type: "workspace" },
        period: {
          cadence: "daily",
          startedAt: new Date("2026-08-14T00:00:00.000Z"),
          endedAt: new Date("2026-08-15T00:00:00.000Z"),
          timezone: "UTC",
          periodKey: "2026-08-14",
        },
        timestampPolicy: "observed_at" as const,
        maxItems: 20,
      },
      selection,
      requestedAt: new Date("2026-08-15T00:01:00.000Z"),
      verifier,
    });

    expect(verifier.input?.verificationLane).toBe("related_topic");
    expect(verifier.input?.evidence.map((item) => item.title)).toContain(
      AUG_14_WATERMARK_REDDIT_TITLE,
    );
    expect(relations).toHaveLength(1);
    expect(selection).toEqual(original);
    expect(selection.clusters.map((cluster) => cluster.id)).toEqual(
      original.clusters.map((cluster) => cluster.id),
    );
    expect(selection.sourceWindow.selectedFeedItemIds).toEqual(
      original.sourceWindow.selectedFeedItemIds,
    );
  });

  it("does not reuse binary same-story approvals", async () => {
    const relations = await verifiedReaderSummaryRelatedTopics({
      query: {
        tenantId: tenantId("tenant-aug14"),
        workspaceId: workspaceId("workspace-aug14"),
        userId: "user-aug14",
        scope: { type: "workspace" },
        period: {
          cadence: "daily",
          startedAt: new Date("2026-08-14T00:00:00.000Z"),
          endedAt: new Date("2026-08-15T00:00:00.000Z"),
          timezone: "UTC",
          periodKey: "2026-08-14",
        },
        timestampPolicy: "observed_at" as const,
        maxItems: 20,
      },
      selection: aug14RelatedTopicSelection(),
      requestedAt: new Date("2026-08-15T00:01:00.000Z"),
      verifier: { verify: async (input) => ({
        verificationLane: input.verificationLane,
        decisions: input.candidates.map((candidate) => ({
          leftFeedItemId: candidate.leftFeedItemId,
          rightFeedItemId: candidate.rightFeedItemId,
          sameStory: false,
          confidenceScore: 0.99,
        })),
        proof: verifiedProof,
      }) },
    });

    expect(relations).toEqual([]);
  });

  it("cancels a dedicated short timeout and records aggregate outcome latency", async () => {
    const metrics = new CapturingRelatedTopicMetrics();
    let signal: AbortSignal | undefined;
    const relations = await verifiedReaderSummaryRelatedTopics({
      query: {
        tenantId: tenantId("tenant-timeout"),
        workspaceId: workspaceId("workspace-timeout"),
        scope: { type: "workspace" },
        period: {
          cadence: "daily",
          startedAt: new Date("2026-08-14T00:00:00.000Z"),
          endedAt: new Date("2026-08-15T00:00:00.000Z"),
          timezone: "UTC",
          periodKey: "2026-08-14",
        },
        timestampPolicy: "observed_at",
        maxItems: 20,
      },
      selection: aug14RelatedTopicSelection(),
      requestedAt: new Date("2026-08-15T00:01:00.000Z"),
      timeoutMs: 1,
      metrics,
      verifier: {
        verify: async (input) => {
          signal = input.signal;
          return new Promise<VerifiedStoryRelationDecisionBatch>(
            () => undefined);
        },
      },
    });

    expect(relations).toEqual([]);
    expect(signal?.aborted).toBe(true);
    expect(metrics.related).toEqual([
      expect.objectContaining({
        status: "timed_out",
        candidateCount: 1,
        approvedCount: 0,
      }),
    ]);
  });
});

class ExplicitRelatedTopicVerifier implements ReaderSummaryStoryRelationVerifierPort {
  input?: ReaderSummaryStoryRelationVerifierInput;

  async verify(input: ReaderSummaryStoryRelationVerifierInput) {
    this.input = input;
    return {
      verificationLane: input.verificationLane,
      decisions: input.candidates.map((candidate) => ({
        leftFeedItemId: candidate.leftFeedItemId,
        rightFeedItemId: candidate.rightFeedItemId,
        relation: "related_topic" as const,
        confidenceScore: 0.99,
        rationale: "The Reddit question discusses the official watermark topic.",
      })),
      proof: verifiedProof,
    };
  }
}

const verifiedProof = {
  normalizedOutputSha256: "a".repeat(64),
  executionAttestationSha256: "b".repeat(64),
  selectedOutputSha256: "c".repeat(64),
};

class CapturingRelatedTopicMetrics implements StoryRankingMetricsPort {
  readonly related: RelatedTopicVerificationMetric[] = [];
  recordStoryRanking(): void {}
  recordStoryRelationVerification(): void {}
  recordRelatedTopicVerification(metric: RelatedTopicVerificationMetric): void {
    this.related.push(metric);
  }
}
