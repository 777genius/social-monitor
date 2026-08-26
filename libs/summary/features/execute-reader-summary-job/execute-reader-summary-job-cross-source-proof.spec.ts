import { FixedClock, tenantId, workspaceId } from
  "@social-monitor/shared-kernel";

import {
  admitReaderPostPromotionEvidence,
  ReaderSummaryJob,
  type StoryRelationCandidateVerificationProof,
  workspaceReaderSummaryScope,
} from "../../domain";
import {
  attestedStoryRelationFixture,
  storyRelationTestProofAuthority,
} from
  "../../domain/services/story-relation-provenance-test-fixtures";
import { hasValidStoryRelationProvenance } from
  "../../domain/services/story-relation-provenance";
import { storyRelationCompatibleWithPromotionSelection } from
  "../../domain/services/story-relation-promotion-compatibility";
import { ExecuteReaderSummaryJobUseCase } from
  "./execute-reader-summary-job.use-case";
import { makeReaderEvidenceSelection } from
  "./execute-reader-summary-job-promotion-fixtures";
import {
  PromotionControlArtifactRepository,
  PromotionControlCapturingModel,
  PromotionControlEventPublisher,
  PromotionControlIdGenerator,
  PromotionControlPolicyRepository,
  PromotionControlPublication,
  PromotionControlPublicationPolicy,
  promotionControlEmptyTopicMapBuilder,
  promotionControlPeriod,
  promotionControlZeroGitHubProjectionReader,
} from "./execute-reader-summary-job-promotion-control.spec-support";
import { FakeReaderSummaryJobRepository } from
  "./execute-reader-summary-job.spec-support";
import {
  NOOP_READER_SUMMARY_PROMOTION_METRICS,
  readerSummaryPromotionControl,
} from "./reader-summary-promotion-control";

describe("ExecuteReaderSummaryJobUseCase cross-source proof lifecycle", () => {
  it("preserves an authenticated relation and selector cluster in the final artifact", async () => {
    const tenant = tenantId("tenant-cross-source-proof");
    const workspace = workspaceId("workspace-cross-source-proof");
    const jobs = new FakeReaderSummaryJobRepository();
    const artifacts = new PromotionControlArtifactRepository();
    const events = new PromotionControlEventPublisher();
    const selection = crossSourceSelection();
    expect(hasValidStoryRelationProvenance(
      selection.approvedSameStoryRelations![0]!,
      storyRelationTestProofAuthority.proofVerifier,
    )).toBe(true);
    expect(storyRelationCompatibleWithPromotionSelection(
      selection.approvedSameStoryRelations![0]!, selection)).toBe(true);
    const admitted = admitReaderPostPromotionEvidence(
      selection,
      storyRelationTestProofAuthority.proofVerifier,
    );
    expect(admitted.approvedSameStoryRelations).toHaveLength(1);
    expect(admitted.selectedEvidence.map((item) => item.feedItemId))
      .toContain("feed-cross-source-support");
    const relation = selection.approvedSameStoryRelations![0]!;
    const restarted = admitReaderPostPromotionEvidence({
      ...selection,
      approvedSameStoryRelations: [{
        ...relation,
        verificationProof: JSON.parse(JSON.stringify(
          relation.verificationProof,
        )) as StoryRelationCandidateVerificationProof,
      }],
    }, storyRelationTestProofAuthority.proofVerifier);
    expect(restarted.approvedSameStoryRelations).toEqual([]);
    expect(restarted.selectedEvidence.map((item) => item.feedItemId))
      .not.toContain("feed-cross-source-support");
    await jobs.save(ReaderSummaryJob.request({
      id: "reader-job-cross-source-proof",
      tenantId: tenant,
      workspaceId: workspace,
      scope: workspaceReaderSummaryScope(),
      period: promotionControlPeriod,
      idempotencyKey: "reader-job-cross-source-proof-key",
      requestedAt: new Date("2026-06-26T08:00:00.000Z"),
    }));

    const result = await new ExecuteReaderSummaryJobUseCase(
      jobs,
      artifacts,
      new PromotionControlPolicyRepository(),
      { select: async () => selection },
      new CrossSourceCapturingModel(),
      new PromotionControlPublication(jobs, artifacts, events),
      new PromotionControlIdGenerator(),
      new FixedClock(new Date("2026-06-26T08:05:00.000Z")),
      readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
      undefined,
      undefined,
      promotionControlEmptyTopicMapBuilder(),
      new PromotionControlPublicationPolicy({
        status: "published",
        qualityPassed: true,
        canonicalScore: 1,
        shadow: {
          mode: "shadow",
          policyVersion: "reader_summary_publication_shadow_v1",
          riskScore: 0,
          signals: [],
        },
        reasons: [],
      }),
      promotionControlZeroGitHubProjectionReader(),
      undefined,
      undefined,
      undefined,
      storyRelationTestProofAuthority.proofVerifier,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-job-cross-source-proof",
    });

    if (!result.ok) throw result.error;
    expect(result).toMatchObject({ ok: true, value: { status: "completed" } });
    expect(artifacts.decisions()[0]).toMatchObject({ status: "published" });
    const published = artifacts.all()[0]?.toSnapshot();
    expect(published?.sourceWindow.storyClusterIds).toContain(
      "selector-cluster:runtime-regression",
    );
    expect(published?.storyClusters.map((cluster) => cluster.id)).toContain(
      "selector-cluster:runtime-regression",
    );
    expect(published?.content?.topReads[0]).toMatchObject({
      confirmedProviderKeys: expect.arrayContaining(["reddit", "x"]),
      citationIds: expect.arrayContaining(["c1", "c2"]),
    });
    expect(published?.content?.narrativeSections).toContainEqual(
      expect.objectContaining({
        id: "lead",
        storyClusterId: "selector-cluster:runtime-regression",
      }),
    );
    expect(events.all()).toHaveLength(1);
  });
});

class CrossSourceCapturingModel extends PromotionControlCapturingModel {
  constructor() {
    super({
        topReads: [{ title: "Runtime regression discussion" }],
        narrativeSections: [{
          id: "lead",
          kind: "lead",
          title: "Overview",
          text: "Cross-source evidence confirms the runtime regression.",
          citationIds: ["c1", "c2"],
          storyClusterId: "selector-cluster:runtime-regression",
        }],
      } as never);
  }

  override async generate(
    ...args: Parameters<PromotionControlCapturingModel["generate"]>
  ) {
    const result = await super.generate(...args);
    const support = args[0].evidence.selectedEvidence.find((item) =>
      item.feedItemId === "feed-cross-source-support");
    if (support === undefined) throw new Error("Cross-source support was not admitted");
    return {
      ...result,
      draft: {
        ...result.draft,
        topStories: result.draft.topStories.map((story, index) =>
          index === 0 ? { ...story, citationIds: ["c1", "c2"] } : story),
        citationMap: [...result.draft.citationMap, {
          citationId: "c2",
          feedItemId: support.feedItemId,
          sourceItemId: support.sourceItemId,
          providerKey: support.providerKey,
          field: "title" as const,
          canonicalUrl: support.canonicalUrl,
        }],
      },
    };
  }
}

const crossSourceSelection = () => {
  const base = makeReaderEvidenceSelection();
  const lead = base.selectedEvidence[0]!;
  const support = {
    ...lead,
    feedItemId: "feed-cross-source-support",
    sourceItemId: "x-cross-source-support",
    sourceBindingId: "binding-x-cross-source-support",
    providerKey: "x-twitter",
    providerName: "X",
    canonicalUrl: "https://x.example.test/cross-source-support",
    title: "Runtime regression confirmed by maintainers",
    score: 1.8,
    promotionFacts: {
      ...lead.promotionFacts!,
      contentKind: "original_post" as const,
      canonicalIdentity: "story:runtime-regression-support",
      authorityAttestation: {
        status: "attested" as const,
        official: false,
        trusted: true,
        attestedBy: "source_catalog" as const,
      },
      officialAccount: false,
      trustedAuthor: true,
      metrics: {
        provider: "x" as const,
        likes: 15,
        reposts: 10,
        weightedScore: 35,
      },
    },
  };
  const cluster = {
    ...base.clusters[0]!,
    id: "selector-cluster:runtime-regression",
    duplicateFeedItemIds: [support.feedItemId],
    providerKeys: [lead.providerKey, support.providerKey],
  };
  const sourceWindow = {
    ...base.sourceWindow,
    selectedFeedItemIds: [lead.feedItemId, support.feedItemId],
    storyClusterIds: [cluster.id],
  };
  const relation = attestedStoryRelationFixture({
    leftFeedItemId: lead.feedItemId,
    rightFeedItemId: support.feedItemId,
    confidence: 0.99,
    verificationLane: "guarded_recall_primary",
    rankingPolicyVersion: base.rankingPolicyVersion,
    sourceWindow: {
      windowId: sourceWindow.windowId,
      startedAt: sourceWindow.startedAt,
      endedAt: sourceWindow.endedAt,
      selectedFeedItemIds: sourceWindow.selectedFeedItemIds,
      storyClusterIds: ["candidate:lead", "candidate:support"],
    },
  });
  return {
    ...base,
    sourceWindow,
    clusters: [cluster],
    selectedEvidence: [lead, support],
    approvedSameStoryRelations: [relation],
  };
};
