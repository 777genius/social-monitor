import { createHash } from "node:crypto";
import { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { classifyFeedPromotionEligibility, feedPromotionMetricAuthority } from "@social-monitor/feed/domain";
import type { InMemorySourceItemRepository } from "@social-monitor/ingestion/adapters/persistence/in-memory-source-item.repository";
import { bindPromotionAssessment, promotionWireCandidate } from "@social-monitor/relevance/adapters/model/promotion-review-wire";
import type { SourceContentQualityReviewerPort } from "@social-monitor/relevance/ports";
import { tenant, workspace } from "./autonomous-monitoring-loop-scope";
import { providerSamples } from "./autonomous-monitoring-loop-support";
import type { ReaderSummaryArtifactProps } from "@social-monitor/summary/domain";

const fixtureIntent = "agent orchestration reliability release monitoring";
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const primaryCoverageIds = (snapshot: ReaderSummaryArtifactProps): readonly string[] =>
  [...new Set((snapshot.promotionAttestations ?? []).flatMap((attestation) => [
    attestation.candidateId, ...(attestation.schemaVersion === "reader_post_promotion_attestation.v3"
      ? [] : attestation.supportFacts.map((fact) => fact.candidateId)),
  ]))];

/** Synthetic first-observation projection, bound to the actual persisted fixture rows. */
export class FixturePersistedPromotionFeedRepository extends InMemoryFeedItemReadRepository {
  constructor(private readonly sourceItems: InMemorySourceItemRepository) { super(); }

  override async readPromotionSnapshot(query: Parameters<InMemoryFeedItemReadRepository["readPromotionSnapshot"]>[0]) {
    const result = await super.readPromotionSnapshot(query);
    if (!result.ok) return result;
    const sources = new Map(this.sourceItems.all().map((item) => [item.toSnapshot().id, item.toSnapshot()]));
    return { ...result, candidates: result.candidates.map((candidate) => {
      const feed = candidate.item.toSnapshot();
      const source = sources.get(feed.sourceItemId);
      if (source === undefined || source.tenantId !== query.tenantId || source.workspaceId !== query.workspaceId ||
          source.sourceBindingId !== feed.sourceBindingId || source.canonicalUrl !== feed.canonicalUrl ||
          source.ingestedAt.getTime() !== feed.observedAt.getTime() ||
          source.publishedAt.getTime() !== feed.publishedAt.getTime() || source.ingestedAt > query.observedThrough) return candidate;
      const canonical = classifyFeedPromotionEligibility({ providerKey: feed.providerKey, providerMetadata: source.metadata });
      if (!canonical.eligible || hash(canonical.metrics) !== hash(candidate.canonical.metrics)) return candidate;
      const metricAuthority = feedPromotionMetricAuthority({
        snapshotObservedAt: feed.observedAt, snapshotChangedAt: feed.observedAt,
        snapshotMetricsHash: hash(candidate.canonical.metrics), currentHasRegressionFromLatest: false,
        latestObservation: { observedAt: source.ingestedAt, metricsHash: hash(canonical.metrics), hasRegression: false },
      });
      return metricAuthority === undefined ? candidate : { ...candidate, metricAuthority };
    }) };
  }
}

/** Curated literal fixture judgments exercise authenticated plumbing, not model accuracy. */
export class FixtureExactEvidenceReviewer implements SourceContentQualityReviewerPort {
  private readonly acceptedCandidateIds = new Set<string>();

  get acceptedReviewCount(): number { return this.acceptedCandidateIds.size; }

  constructor(private readonly sourceItems: InMemorySourceItemRepository,
    private readonly feedItems: InMemoryFeedItemReadRepository) {}

  async reviewBatch(requests: Parameters<SourceContentQualityReviewerPort["reviewBatch"]>[0]) {
    return requests.flatMap((request) => {
      const binding = request.promotion;
      const feed = this.feedItems.all().find((item) => item.toSnapshot().id === request.candidateId)?.toSnapshot();
      const source = this.sourceItems.all().find((item) => item.toSnapshot().id === feed?.sourceItemId)?.toSnapshot();
      if (binding === undefined || feed === undefined || source === undefined ||
          !["reddit", "hacker-news"].includes(feed.providerKey) ||
          binding.tenantId !== tenant || binding.workspaceId !== workspace || binding.trustedIntent !== fixtureIntent ||
          feed.tenantId !== tenant || feed.workspaceId !== workspace || source.tenantId !== tenant || source.workspaceId !== workspace ||
          binding.interestId !== feed.interestId || binding.sourceBindingId !== feed.sourceBindingId ||
          binding.sourceItemId !== source.id || source.sourceBindingId !== feed.sourceBindingId ||
          source.canonicalUrl !== feed.canonicalUrl ||
          (request.canonicalUrl !== undefined && request.canonicalUrl !== feed.canonicalUrl) ||
          request.providerKey !== feed.providerKey) return [];
      const expected = providerSamples(feed.providerKey as "reddit" | "hacker-news", feed.sourceBindingId, fixtureIntent)
        .find((item) => item.externalId === source.externalId);
      if (expected === undefined || expected.canonicalUrl !== source.canonicalUrl || expected.title !== source.title ||
          expected.body !== source.body || request.title !== expected.title || request.bodyPreview !== expected.body ||
          feed.title !== expected.title || feed.bodyPreview !== expected.body || binding.availability !== "body_present") return [];
      const evidence = [{ field: "bodyPreview", start: 0, end: expected.body.length, quote: expected.body }];
      this.acceptedCandidateIds.add(request.candidateId);
      return [{ candidateId: request.candidateId, decision: "promote" as const, confidence: 0.95,
        qualityScore: 0.85, interestRelevanceScore: 0.95, engagementIntegrityScore: 0.95,
        flags: [], reason: "Curated deterministic fixture judgment over the exact captured text.",
        assessment: bindPromotionAssessment({ bindingId: promotionWireCandidate(request).bindingId,
          evidence, resolvedSoftFlags: [], readerHeadline: { status: "available", kind: "claim",
            text: request.title, confidence: 0.95, support: [{ field: "title", start: 0,
              end: request.title.length, quote: request.title }], qualifications: [],
            wholeInput: { titleLength: request.title.length, bodyLength: expected.body.length,
              qualificationJudgment: "none" } } }, request),
      }];
    });
  }
}
