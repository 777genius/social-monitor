import type { PoolClient } from "pg";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import {
  canonicalPromotionPayload,
  promotionPayloadDigest,
  ReaderSummaryArtifact,
  READER_POST_PROMOTION_POLICY_V1,
  selectReaderPostPromotions,
  type ReaderPostPromotionAttestationV1,
  type ReaderPostPromotionAttestationV2,
  type ReaderPostPromotionInput,
} from "@social-monitor/summary/domain";
import { serializeReaderSummaryArtifact } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-json";
import { content as promotionContentFixture } from
  "../../libs/summary/domain/policies/reader-summary-publication-policy-test-fixtures";
import { buildReaderPromotionV2TestAttestations } from
  "../../libs/summary/domain/services/reader-post-promotion-attestation.spec-support";
import type { ReaderSummaryPublicationEvidenceFixture } from
  "./reader-summary-weekly-publication-evidence-postgres-contract";

type ArtifactRow = Readonly<{
  id: string;
  tenant_id: string;
  workspace_id: string;
  period_started_at: string;
  period_ended_at: string;
  period_timezone: string;
  period_key: string;
  model_version: string;
  prompt_version: string;
  headline: string;
  summary_text: string;
  citations: readonly Readonly<{
    citationId: string;
    feedItemId: string;
    sourceItemId: string;
    providerKey: string;
    field: "title";
    canonicalUrl?: string;
  }>[];
  created_at: string;
}>;

export const preparePromotionRollbackLifecycleFixture = async (
  client: PoolClient,
  fixture: ReaderSummaryPublicationEvidenceFixture,
  version: "v1" | "v2",
): Promise<void> => {
  const result = await client.query<ArtifactRow>(`
    SELECT id::text, tenant_id::text, workspace_id::text,
      period_started_at::text, period_ended_at::text, period_timezone,
      period_key, model_version, prompt_version, headline, summary_text,
      citations, created_at::text
    FROM reader_summary_artifacts
    WHERE id=$1::uuid AND status='RUNNING'
  `, [fixture.artifactId]);
  const row = result.rows[0];
  const citation = row?.citations[0];
  if (row === undefined || citation === undefined ||
      citation.providerKey !== "reddit") {
    throw new Error("Rollback lifecycle fixture needs exact Reddit evidence");
  }
  const citations = Array.from({ length: 8 }, (_, index) => index === 0
    ? citation
    : {
        ...citation,
        citationId: fixtureUuid(104 + index),
        feedItemId: fixtureUuid(105 + index),
        sourceItemId: fixtureUuid(106 + index),
        canonicalUrl: `https://reddit.example.test/rollback-${index + 1}`,
      });
  const startedAt = new Date(row.period_started_at);
  const endedAt = new Date(row.period_ended_at);
  const publishedAt = new Date(startedAt.getTime() + 8 * 3_600_000);
  const observedAt = new Date(startedAt.getTime() + 9 * 3_600_000);
  const clusterIds = citations.map((_, index) =>
    `rollback:${fixture.artifactId}:${index + 1}`);
  const sourceWindow = {
    windowId: `rollback-window:${fixture.artifactId}`,
    startedAt,
    endedAt,
    selectedFeedItemIds: citations.map((item) => item.feedItemId),
    storyClusterIds: clusterIds,
    periodStartedAt: startedAt,
    periodEndedAt: endedAt,
    ingestionCutoff: observedAt,
  };
  const candidates: readonly ReaderPostPromotionInput[] = citations.map(
    (item, index) => ({
    candidateId: item.feedItemId,
    provider: "reddit",
    contentKind: "original_post",
    canonicalIdentity: `url:${item.canonicalUrl}`,
    clusterId: clusterIds[index],
    citationId: item.citationId,
    publishedAt,
    observedAt,
    periodStart: startedAt,
    periodEnd: endedAt,
    ingestionCutoff: observedAt,
    freshnessValid: true,
    qualityScore: 0.9,
    relevanceScore: 0.9,
    integrityScore: 0.9,
    qualityValid: true,
    safetyValid: true,
    citationValid: true,
    metricsState: "observed",
    metrics: { provider: "reddit", score: 500 - index, upvoteRatio: 0.95 },
    whyImportant: "Rollback lifecycle fixture",
  }));
  const selection = selectReaderPostPromotions(candidates);
  const v2Attestations = buildReaderPromotionV2TestAttestations(selection, {
    artifactId: fixture.artifactId,
    sourceWindow,
  });
  const attestations = version === "v2"
    ? v2Attestations
    : v1Attestations(v2Attestations, selection);
  const cards = attestations.map((attestation, index) => promotionCard(
    attestation,
    clusterIds[index]!,
    citations[index]?.canonicalUrl,
  ));
  const artifact = ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: fixture.artifactId,
    tenantId: tenantId(row.tenant_id),
    workspaceId: workspaceId(row.workspace_id),
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt,
      endedAt,
      timezone: row.period_timezone,
      periodKey: row.period_key,
    },
    generatedAt: new Date(row.created_at),
    sourceWindow,
    storyClusters: citations.map((item, index) => ({
      id: clusterIds[index]!,
      storyKey: clusterIds[index]!,
      representativeFeedItemId: item.feedItemId,
      duplicateFeedItemIds: [],
      interestIds: ["fixture-interest"],
      providerKeys: ["reddit"],
      score: 1,
      observedAtRange: { startedAt: publishedAt, endedAt: observedAt },
      whyImportant: ["Rollback lifecycle fixture"],
    })),
    contextArtifacts: [],
    headline: row.headline,
    executiveSummary: row.summary_text,
    content: promotionContentFixture({
      headline: row.headline,
      oneLineTakeaway: row.summary_text,
      bullets: [row.summary_text],
      narrativeSections: [{
        id: `rollback-narrative:${fixture.artifactId}`,
        kind: "lead",
        title: row.headline,
        text: row.summary_text,
        citationIds: [citation.citationId],
        storyClusterId: clusterIds[0],
      }],
      sourceMix: [{
        providerKey: "reddit",
        itemCount: 8,
        citationCount: 8,
        storyClusterCount: 8,
        crossSourceClusterCount: 0,
        singleSourceOnly: true,
        interestIds: ["fixture-interest"],
      }],
      topReads: cards.filter((card) => card.promotionTier === "top"),
      selectedPosts: cards.filter((card) =>
        card.promotionTier === "additional"),
    }),
    topStories: citations.map((item, index) => ({
      storyClusterId: clusterIds[index]!,
      title: row.headline,
      summary: row.summary_text,
      interestIds: ["fixture-interest"],
      providerKeys: ["reddit"],
      citationIds: [item.citationId],
    })),
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: citations,
    qualityFlags: [],
    confidence: {
      level: "medium",
      score: 0.8,
      rationale: "The fixture is bound to exact persisted evidence.",
    },
    lineage: {
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: row.model_version,
      providerVersion: "reader-summary.provider.pg-gate.v1",
      promptVersion: row.prompt_version,
      rulesVersion: "reader-summary.rules.pg-gate.v1",
      evalDatasetVersion: "reader-summary.eval.pg-gate.v1",
    },
    usage: { inputTokens: 10, outputTokens: 10, estimatedCostUsd: 0 },
    promotionAttestations: attestations,
    promotionEvidenceFacts: candidates,
  });
  const serialized = serializeReaderSummaryArtifact(artifact);
  const updated = await client.query(`UPDATE reader_summary_artifacts
    SET artifact_payload=$2::jsonb, citations=$3::jsonb
    WHERE id=$1::uuid AND status='RUNNING'
    RETURNING id`, [
    fixture.artifactId,
    JSON.stringify(serialized),
    JSON.stringify(citations),
  ]);
  if (updated.rows.length !== 1) {
    throw new Error("Rollback lifecycle fixture lost candidate authority");
  }
};

const promotionCard = (
  attestation: ReaderPostPromotionAttestationV1 |
    ReaderPostPromotionAttestationV2,
  storyClusterId: string,
  canonicalUrl: string | undefined,
) => ({
  storyClusterId,
  cardKind: attestation.placement === "top"
    ? "curated_top_read" as const
    : "additional_notable_story" as const,
  promotionMarker: "reader_post_promotion" as const,
  promotionPolicyVersion: attestation.policyVersion,
  promotionTier: attestation.placement,
  promotionCandidateId: attestation.candidateId,
  promotionCanonicalIdentity: attestation.canonicalIdentity,
  title: "Publication lifecycle fixture",
  providerKey: "reddit",
  providerName: "Reddit",
  primaryActionKind: "read_source" as const,
  reason: "It proves the publication rollback lifecycle.",
  matchedInterestIds: ["fixture-interest"],
  matchedRules: ["rollback-lifecycle"],
  signalScore: 1,
  confidence: {
    level: "medium" as const,
    score: 0.8,
    rationale: "The fixture is bound to exact persisted evidence.",
  },
  confirmedProviderKeys: ["reddit"],
  providerMetrics: [],
  whyImportant: ["It proves the real publisher lifecycle."],
  whyNow: "The replacement publication is active.",
  ...(canonicalUrl === undefined ? {} : { canonicalUrl }),
  citationIds: attestation.citationIds,
  ...(attestation.schemaVersion === "reader_post_promotion_attestation.v1"
    ? {}
    : {
        editorialPolicyVersion: "reader_promotion_policy.v2" as const,
        editorialPlacement: attestation.placement,
        editorialSlot: attestation.slot,
        editorialScoreComponents: attestation.scoreComponents,
        editorialReasonCodes: attestation.reasonCodes,
        editorialCandidateDigestInput: attestation.candidateDigestInput,
        editorialDigestInput: attestation.slateEntryDigestInput,
      }),
});

const fixtureUuid = (suffix: number): string =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const v1Attestations = (
  attestations: readonly ReaderPostPromotionAttestationV2[],
  selection: ReturnType<typeof selectReaderPostPromotions>,
): readonly ReaderPostPromotionAttestationV1[] => attestations.map(
  (attestation, index) => {
    const {
      schemaVersion: _schemaVersion, policyVersion: _policyVersion,
      digestVersion: _digestVersion, digest: _digest,
      canonicalPayload: _canonicalPayload, storyClusterId: _storyClusterId,
      scoreComponents: _scoreComponents, reasonCodes: _reasonCodes,
      candidateDigestInput: _candidateDigestInput,
      slateEntryDigestInput: _slateEntryDigestInput,
      slateDigestInput: _slateDigestInput, slateDigest: _slateDigest,
      evidenceLineage: _evidenceLineage, ...common
    } = attestation;
    void _schemaVersion;
    void _policyVersion;
    void _digestVersion;
    void _digest;
    void _canonicalPayload;
    void _storyClusterId;
    void _scoreComponents;
    void _reasonCodes;
    void _candidateDigestInput;
    void _slateEntryDigestInput;
    void _slateDigestInput;
    void _slateDigest;
    void _evidenceLineage;
    const decision = selection.decisions.find((item) =>
      item.candidateId === attestation.candidateId)!;
    const weights = READER_POST_PROMOTION_POLICY_V1
      .additionalUsefulnessWeights;
    const duration = attestation.periodEndedAt.getTime() -
      attestation.periodStartedAt.getTime();
    const freshness = duration <= 0 ? 0 : Math.max(0, Math.min(
      1,
      (attestation.publishedAt.getTime() -
        attestation.periodStartedAt.getTime()) / duration,
    ));
    const components = {
      normalizedStrength:
        decision.normalizedStrength * weights.normalizedStrength,
      qualityScore: attestation.qualityScore * weights.qualityScore,
      interestRelevanceScore:
        attestation.relevanceScore * weights.interestRelevanceScore,
      engagementIntegrityScore:
        attestation.integrityScore * weights.engagementIntegrityScore,
      freshness: freshness * weights.freshness,
    };
    const body = {
      ...common,
      schemaVersion: "reader_post_promotion_attestation.v1" as const,
      policyVersion: "reader_post_promotion.v1" as const,
      digestVersion: "reader_post_promotion_digest.sha256.v1" as const,
      slot: index,
      usefulnessComponents: {
        ...components,
        total: Object.values(components).reduce(
          (sum, value) => sum + value,
          0,
        ),
      },
    };
    const canonicalPayload = canonicalPromotionPayload(body);
    return {
      ...body,
      canonicalPayload,
      digest: promotionPayloadDigest(canonicalPayload),
    };
  },
);
