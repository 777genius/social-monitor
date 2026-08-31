import { createHash } from "node:crypto";

import { InMemoryFeedItemReadRepository } from
  "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { FeedItem } from "@social-monitor/feed/domain";
import { InMemoryUserRelevanceProfileRepository } from
  "@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from
  "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import {
  FixedClock,
  tenantId,
  workspaceId,
  type IdGenerator,
} from "@social-monitor/shared-kernel";

import { InMemorySummaryEventPublisher } from
  "../../adapters/messaging/in-memory-summary-event-publisher";
import { RelevanceReaderSummaryEvidenceSelector } from
  "../../adapters/evidence/relevance-reader-summary-evidence.selector";
import { InMemoryReaderSummaryArtifactRepository } from
  "../../adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from
  "../../adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPublication } from
  "../../adapters/persistence/in-memory-reader-summary-publication";
import {
  additionalReaderSummaryEvidence,
  primaryReaderSummaryEvidence,
  ReaderSummaryJob,
  workspaceReaderSummaryScope,
  type ReaderPostPromotionAttestationV2,
  type ReaderSummaryEditorialSlate,
  type SummaryEvidenceSelection,
} from "../../domain";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelFailure,
  ReaderSummaryModelPort,
  ReaderSummaryModelRoute,
  ReaderSummaryModelValidationResult,
} from "../../ports";
import { ExecuteReaderSummaryJobUseCase } from
  "../../features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import {
  NOOP_READER_SUMMARY_PROMOTION_METRICS,
  readerSummaryPromotionControl,
} from "../../features/execute-reader-summary-job/reader-summary-promotion-control";
import {
  PromotionControlPolicyRepository,
  promotionControlEmptyTopicMapBuilder,
  promotionControlZeroGitHubProjectionReader,
} from "../../features/execute-reader-summary-job/execute-reader-summary-job-promotion-control.spec-support";

describe("ExecuteReaderSummaryJobUseCase V2 combined publication path", () => {
  it("persists one immutable real-selector slate without changing order, lane, digest, or confidence", async () => {
    const tenant = tenantId("tenant-v2-combined-publication");
    const workspace = workspaceId("workspace-v2-combined-publication");
    const jobId = "reader-job-v2-combined-publication";
    const artifactId = "reader-artifact-v2-combined-publication";
    const now = new Date("2026-08-30T18:00:00.000Z");
    const period = {
      cadence: "weekly" as const,
      startedAt: new Date("2026-08-24T00:00:00.000Z"),
      endedAt: new Date("2026-08-31T00:00:00.000Z"),
      timezone: "UTC",
      periodKey:
        "weekly:2026-08-24T00:00:00.000Z:2026-08-31T00:00:00.000Z:UTC",
    };
    const feedItems = new InMemoryFeedItemReadRepository();
    publicationCandidates().forEach((candidate, index) => {
      const publishedAt = new Date(
        Date.parse("2026-08-30T12:00:00.000Z") + index * 60_000,
      );
      feedItems.upsert(FeedItem.publish({
        id: candidate.id,
        tenantId: tenant,
        workspaceId: workspace,
        interestId: "interest-engineering",
        sourceItemId: `${candidate.id}:source`,
        sourceBindingId: "binding-x-publication-fixture",
        providerKey: "x-twitter",
        canonicalUrl: `https://fixture.test/releases/${candidate.id}`,
        title: candidate.title,
        bodyPreview: candidate.body,
        publishedAt,
        observedAt: new Date(publishedAt.getTime() + 30_000),
        providerMetadata: {
          kind: "x_post",
          contentKind: "original_post",
          likes: 10_000 - index * 500,
          reposts: 1_000 - index * 50,
        },
      }));
    });
    const jobs = new InMemoryReaderSummaryJobRepository();
    const artifacts = new InMemoryReaderSummaryArtifactRepository();
    const events = new InMemorySummaryEventPublisher();
    const clock = new FixedClock(now);
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      new RankFeedItemsUseCase(
        feedItems,
        new InMemoryUserRelevanceProfileRepository(),
        clock,
      ),
      feedItems,
      clock,
    );
    let selectedEvidence: SummaryEvidenceSelection | undefined;
    const model = new ImmutableSlatePublicationModel();
    await jobs.save(ReaderSummaryJob.request({
      id: jobId,
      tenantId: tenant,
      workspaceId: workspace,
      scope: workspaceReaderSummaryScope(),
      period,
      idempotencyKey: "reader-v2-combined-publication-key",
      requestedAt: new Date("2026-08-30T17:59:00.000Z"),
    }));
    const result = await new ExecuteReaderSummaryJobUseCase(
      jobs,
      artifacts,
      new PromotionControlPolicyRepository(),
      {
        async select(params) {
          selectedEvidence = await selector.select(params);
          return selectedEvidence;
        },
      },
      model,
      new InMemoryReaderSummaryPublication(jobs, artifacts, events),
      new PublicationPathIdGenerator(artifactId),
      clock,
      readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
      undefined,
      undefined,
      promotionControlEmptyTopicMapBuilder(),
      undefined,
      promotionControlZeroGitHubProjectionReader(),
      undefined,
      undefined,
      undefined,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: jobId,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        readerSummaryJobId: jobId,
        status: "completed",
        readerSummaryId: artifactId,
      },
    });
    const slate = selectedEvidence?.editorialSlate;
    expect(slate).toBeDefined();
    if (slate === undefined) return;
    expect(slate.top).toHaveLength(8);
    expect(slate.additional).toHaveLength(1);
    expect(Object.isFrozen(slate)).toBe(true);
    expect(Object.isFrozen(slate.top)).toBe(true);
    expect(Object.isFrozen(slate.top[0])).toBe(true);
    expect(model.observedSlate).toBe(slate);
    expect(model.slateJsonAfterGeneration).toBe(JSON.stringify(slate));
    expect(model.primaryCandidateIds).toEqual(
      slate.top.map((entry) => entry.candidateId),
    );
    expect(model.additionalCandidateIds).toEqual(
      slate.additional.map((entry) => entry.candidateId),
    );

    const persisted = await artifacts.findById({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryId: artifactId,
    });
    expect(persisted).not.toBeNull();
    const snapshot = persisted!.toSnapshot();
    expect(events.all()).toHaveLength(1);
    expect(jobs.all()[0]?.toSnapshot()).toMatchObject({
      status: "completed",
      readerSummaryId: artifactId,
    });
    expect(snapshot.content?.topReads.map((item) =>
      item.promotionCandidateId)).toEqual(
      slate.top.map((entry) => entry.candidateId),
    );
    expect(snapshot.content?.selectedPosts.map((item) =>
      item.promotionCandidateId)).toEqual(
      slate.additional.map((entry) => entry.candidateId),
    );
    const promotionCards = [
      ...(snapshot.content?.topReads ?? []),
      ...(snapshot.content?.selectedPosts ?? []),
    ];
    expect(promotionCards.every((item) =>
      item.confidence.score === 0.42 && item.confidence.level === "low",
    )).toBe(true);
    expect(snapshot.confidence).toMatchObject({ level: "low", score: 0.42 });

    const attestations = (snapshot.promotionAttestations ?? []).filter(
      (attestation): attestation is ReaderPostPromotionAttestationV2 =>
        attestation.schemaVersion === "reader_post_promotion_attestation.v2",
    );
    const orderedEntries = [...slate.top, ...slate.additional];
    expect(attestations).toHaveLength(orderedEntries.length);
    expect(attestations.map((attestation) => ({
      schemaVersion: attestation.schemaVersion,
      policyVersion: attestation.policyVersion,
      digestVersion: attestation.digestVersion,
      placement: attestation.placement,
      slot: attestation.slot,
      candidateId: attestation.candidateId,
      canonicalIdentity: attestation.canonicalIdentity,
      storyClusterId: attestation.storyClusterId,
      scoreComponents: attestation.scoreComponents,
      reasonCodes: attestation.reasonCodes,
      candidateDigestInput: attestation.candidateDigestInput,
      slateEntryDigestInput: attestation.slateEntryDigestInput,
      slateDigestInput: attestation.slateDigestInput,
    }))).toEqual(orderedEntries.map((entry) => ({
      schemaVersion: "reader_post_promotion_attestation.v2",
      policyVersion: "reader_post_promotion.v2",
      digestVersion: "reader_post_promotion_digest.sha256.v2",
      placement: entry.placement,
      slot: entry.slot,
      candidateId: entry.candidateId,
      canonicalIdentity: entry.canonicalIdentity,
      storyClusterId: entry.storyClusterId,
      scoreComponents: entry.scoreComponents,
      reasonCodes: entry.reasonCodes,
      candidateDigestInput: entry.candidateDigestInput,
      slateEntryDigestInput: entry.digestInput,
      slateDigestInput: slate.digestMaterial,
    })));
    expect(new Set(attestations.map((item) => item.slateDigest))).toEqual(
      new Set([
        createHash("sha256").update(slate.digestMaterial).digest("hex"),
      ]),
    );
    expect(attestations.every((item) =>
      item.confidence === 0.42 && item.providerCount === 1,
    )).toBe(true);
    expect(attestations.every((item) =>
      /^[0-9a-f]{64}$/u.test(item.digest) &&
      /^[0-9a-f]{64}$/u.test(item.slateDigest),
    )).toBe(true);
  });
});

class PublicationPathIdGenerator implements IdGenerator {
  private callCount = 0;

  constructor(private readonly artifactId: string) {}

  generate(): string {
    this.callCount += 1;
    return this.callCount === 1
      ? this.artifactId
      : "reader-event-v2-combined-publication";
  }
}

class ImmutableSlatePublicationModel implements ReaderSummaryModelPort {
  observedSlate?: ReaderSummaryEditorialSlate;
  slateJsonAfterGeneration?: string;
  primaryCandidateIds: readonly string[] = [];
  additionalCandidateIds: readonly string[] = [];

  route(): ReaderSummaryModelRoute {
    return {
      provider: "deterministic-local",
      model: "immutable-slate-publication-model-v1",
      promptVersion: "reader_summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
    };
  }

  estimate(): ReaderSummaryModelEstimate {
    return { inputTokens: 200, outputTokens: 200, estimatedCostUsd: 0 };
  }

  async generate(
    input: Parameters<ReaderSummaryModelPort["generate"]>[0],
    route: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt> {
    const slate = input.evidence.editorialSlate;
    if (slate === undefined) throw new Error("V2 publication fixture needs a slate");
    this.observedSlate = slate;
    this.primaryCandidateIds = primaryReaderSummaryEvidence(input.evidence)
      .selectedEvidence.map((item) => item.feedItemId);
    this.additionalCandidateIds = additionalReaderSummaryEvidence(input.evidence)
      .selectedEvidence.map((item) => item.feedItemId);
    const evidenceById = new Map(input.evidence.selectedEvidence.map((item) =>
      [item.feedItemId, item] as const));
    const citationId = (feedItemId: string) => `citation:${feedItemId}`;
    const citationMap = input.evidence.selectedEvidence.map((item) => ({
      citationId: citationId(item.feedItemId),
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      providerKey: item.providerKey,
      field: "title" as const,
      canonicalUrl: item.canonicalUrl,
    }));
    const topStories = slate.top.map((entry) => {
      const item = evidenceById.get(entry.candidateId)!;
      return {
        storyClusterId: entry.storyClusterId,
        title: item.title,
        summary: `The monitored source reports ${item.title.toLowerCase()}.`,
        interestIds: [item.interestId],
        providerKeys: [item.providerKey],
        citationIds: [citationId(item.feedItemId)],
      };
    });
    const lead = input.coveragePlan.lead;
    if (lead === undefined) throw new Error("V2 publication fixture needs a lead");
    const leadCitationIds = lead.feedItemIds.map(citationId);
    const draft = {
      headline: "Engineering releases draw sustained developer attention",
      executiveSummary:
        "Several concrete engineering releases drew strong monitored attention.",
      topStories,
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap,
      qualityFlags: [],
      confidence: {
        level: "medium" as const,
        score: 0.7,
        rationale: "The model received the backend-selected evidence.",
      },
      lineage: {
        promptVersion: route.promptVersion,
        schemaVersion: route.schemaVersion,
        modelVersion: route.model,
        providerVersion: route.provider,
        rulesVersion: input.policy.rulesVersion,
        evalDatasetVersion: "reader_summary.eval.test.v1",
        rankingPolicyVersion: input.evidence.rankingPolicyVersion,
      },
      usage: this.estimate(),
      content: {
        headline: "Engineering releases draw sustained developer attention",
        narrativeSections: [{
          id: "lead",
          kind: "lead" as const,
          title: "Main release signal",
          text: "The strongest monitored release is the primary signal.",
          citationIds: leadCitationIds,
          storyClusterId: lead.clusterId,
        }],
      },
    };
    this.slateJsonAfterGeneration = JSON.stringify(slate);
    return { route, draft };
  }

  validateRawProviderResponse(): ReaderSummaryModelValidationResult {
    return { ok: true };
  }

  classifyError(error: unknown): ReaderSummaryModelFailure {
    return {
      kind: "unknown",
      retryable: false,
      message: error instanceof Error ? error.message : "unknown fixture error",
    };
  }
}

const publicationCandidates = () => [
  {
    id: "atlas-database",
    title: "Atlas database adds deterministic snapshot recovery",
    body: "The release adds bounded recovery receipts for failed transactions.",
  },
  {
    id: "beacon-compiler",
    title: "Beacon compiler ships reproducible module diagnostics",
    body: "The compiler now reports stable module failures across repeated builds.",
  },
  {
    id: "cedar-runtime",
    title: "Cedar runtime introduces isolated task checkpoints",
    body: "The runtime isolates checkpoint state for long-running developer tasks.",
  },
  {
    id: "delta-storage",
    title: "Delta storage publishes atomic backup receipts",
    body: "The storage engine publishes verifiable receipts after atomic backups.",
  },
  {
    id: "ember-sdk",
    title: "Ember SDK adds typed retry outcomes",
    body: "The SDK exposes typed retry outcomes for integration failures.",
  },
  {
    id: "forge-cli",
    title: "Forge CLI gains workspace-scoped release previews",
    body: "The command line preview keeps release changes scoped to one workspace.",
  },
  {
    id: "glint-api",
    title: "Glint API enables cursor-bound audit exports",
    body: "The API binds every audit export to a stable pagination cursor.",
  },
  {
    id: "harbor-cache",
    title: "Harbor cache prevents stale generation writes",
    body: "The cache rejects generation results after their selection scope changes.",
  },
  {
    id: "ion-worker",
    title: "Ion worker records bounded execution leases",
    body: "The worker records explicit lease outcomes for bounded background jobs.",
  },
] as const;
