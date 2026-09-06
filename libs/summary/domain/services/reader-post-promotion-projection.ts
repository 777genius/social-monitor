import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopRead, TopReadCandidate } from "../entities/top-read";
import {
  selectReaderPostPromotions,
  type SelectedReaderPostPromotion,
} from "../policies/reader-post-promotion-selection";
import {
  evaluateReaderPostPromotion,
  readerPostProviderFamily,
  READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION,
  READER_POST_PROMOTION_POLICY_V1,
  type ReaderPostPromotionInput,
  type ReaderPostPromotionAttestation,
} from "../policies/reader-post-promotion-policy";
import type {
  ApprovedSameStoryRelation,
  RelatedTopicRelation,
  StoryCluster,
  SummaryEvidenceItem,
  SummarySourceWindow,
} from "../value-objects/summary-evidence-item";
import type { ReaderSummaryEditorialSlate } from
  "../value-objects/reader-summary-editorial-slate";
import { normalizeSignalScore } from "../value-objects/signal-score";
import { readerSummaryIndependentProviderFamily } from
  "../value-objects/reader-summary-provider-identity";
import { compactUnique } from "../value-objects/summary-text";
import { buildMatchedRules } from "./reader-summary-source-lineage";
import {
  buildReaderPostPromotionTitle,
  hasReaderFacingPromotionSource,
} from "./reader-post-promotion-title";
import {
  buildReaderPostPromotionAttestations,
  type ReaderPostPromotionAttestationBinding,
} from "./reader-post-promotion-attestation";
import { projectReaderPostPromotionAdmittedClusters } from
  "./reader-post-promotion-admitted-clusters";
import { readerPostPromotionSelectionFromEditorialSlate } from
  "./reader-post-promotion-editorial-slate-selection";
import { buildReaderPostPromotionReasons } from "./reader-post-promotion-reasons";
import {
  readerPostPromotionBoundary,
  readerPostPromotionFreshnessIsValid,
} from "./reader-post-promotion-freshness";

export type ReaderPostPromotionProjection = {
  readonly topReads: readonly TopRead[];
  readonly additionalPosts: readonly TopRead[];
  readonly admittedEvidence: readonly SummaryEvidenceItem[];
  readonly admittedCitations: readonly ReaderSummaryCitation[];
  readonly admittedClusters: readonly StoryCluster[];
  readonly topClusterIds: ReadonlySet<string>;
  readonly attestations: readonly ReaderPostPromotionAttestation[];
  readonly attestedEvidenceFacts: readonly ReaderPostPromotionInput[];
  readonly evaluatedEvidence: readonly {
    readonly candidateId: string;
    readonly decision: ReturnType<typeof evaluateReaderPostPromotion>["decision"];
  }[];
};

export const buildReaderPostPromotionProjection = (params: {
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly clusters: readonly StoryCluster[];
  readonly citations: readonly ReaderSummaryCitation[];
  readonly sourceWindow: SummarySourceWindow;
  readonly approvedSameStoryRelations?: readonly ApprovedSameStoryRelation[];
  readonly relatedTopicRelations?: readonly RelatedTopicRelation[];
  readonly attestationBinding?: Omit<
    ReaderPostPromotionAttestationBinding,
    "editorialSlate"
  >;
  readonly editorialSlate?: ReaderSummaryEditorialSlate;
  readonly topStories?: readonly TopReadCandidate[];
}): ReaderPostPromotionProjection => {
  const evidenceById = uniqueEvidenceById(params.evidence);
  const citationByFeedItemId = citationByEvidenceId(params.citations);
  const clusterByEvidenceId = clusterMembership(params.clusters);
  const periodStart = params.sourceWindow.periodStartedAt ??
    params.sourceWindow.startedAt;
  const periodEnd = params.sourceWindow.periodEndedAt ??
    params.sourceWindow.endedAt;
  const ingestionCutoff = params.sourceWindow.ingestionCutoff ?? periodEnd;
  const baseInputs = params.evidence.map((item): ReaderPostPromotionInput => {
    const quality = item.contentQuality;
    const facts = item.promotionFacts;
    const citation = citationByFeedItemId.get(item.feedItemId);
    return {
      candidateId: item.feedItemId,
      provider: item.providerKey,
      contentKind: facts?.contentKind ?? "unknown",
      canonicalIdentity: facts?.canonicalIdentity ?? "",
      citationId: citation?.citationId ?? "",
      publishedAt: item.publishedAt,
      observedAt: item.observedAt,
      ...(facts?.checkedAt === undefined ? {} : { checkedAt: facts.checkedAt }),
      periodStart,
      periodEnd,
      ingestionCutoff,
      exactPeriodStart: readerPostPromotionBoundary(periodStart),
      exactPeriodEnd: readerPostPromotionBoundary(periodEnd),
      exactPublishedAt: facts?.freshnessProvenance?.status === "observed"
        ? facts.freshnessProvenance.exactPublishedAt
        : undefined,
      exactObservedAt: facts?.freshnessProvenance?.status === "observed"
        ? facts.freshnessProvenance.exactObservedAt
        : undefined,
      exactIngestionCutoff: facts?.freshnessProvenance?.status === "observed"
        ? facts.freshnessProvenance.exactIngestionCutoff
        : undefined,
      freshnessValid: readerPostPromotionFreshnessIsValid({
        facts,
        publishedAt: item.publishedAt,
        observedAt: item.observedAt,
        ingestionCutoff,
      }),
      qualityScore: quality?.qualityScore ?? Number.NaN,
      relevanceScore: quality?.interestRelevanceScore ?? Number.NaN,
      integrityScore: quality?.engagementIntegrityScore ?? Number.NaN,
      qualityValid: hasReaderFacingPromotionSource(item) &&
        quality?.eligibleForSummary === true &&
        quality.eligibleForTopRead === true &&
        quality.needsLlmReview === false &&
        quality.decision !== "downrank" &&
        quality.decision !== "reject",
      safetyValid: facts?.safetyValid === true,
      citationValid: citation !== undefined && citationMatchesEvidence(citation, item),
      ...(facts?.authorityAttestation === undefined
        ? {}
        : { authorityAttestation: facts.authorityAttestation }),
      metricsState: facts?.metricsState ??
        (facts?.metrics === undefined ? "missing" : "observed"),
      ...(facts?.metrics === undefined ? {} : { metrics: facts.metrics }),
      whyImportant: item.whyImportant.find((reason) => reason.trim().length > 0) ??
        buildReaderPostPromotionTitle({ lead: item }),
      clusterId: clusterByEvidenceId.get(item.feedItemId),
    };
  });
  const relationByEvidenceId = params.editorialSlate === undefined
    ? promotionRelations({
        evidenceById,
        inputByEvidenceId: new Map(baseInputs.map((input) =>
          [input.candidateId, input])),
        approvedSameStoryRelations: params.approvedSameStoryRelations ?? [],
        relatedTopicRelations: params.relatedTopicRelations ?? [],
      })
    : new Map<string, ReaderPostPromotionInput["relation"]>();
  const inputs = baseInputs.map((input): ReaderPostPromotionInput => {
    const relation = relationByEvidenceId.get(input.candidateId);
    return relation === undefined ? input : { ...input, relation };
  });
  const selection = params.editorialSlate === undefined
    ? selectReaderPostPromotions(inputs)
    : readerPostPromotionSelectionFromEditorialSlate(
        params.editorialSlate,
        inputs,
      );
  const decisionByCandidateId = new Map(selection.decisions.map((decision) =>
    [decision.candidateId, decision] as const));
  const materialize = (
    selected: SelectedReaderPostPromotion,
    cardKind: "curated_top_read" | "additional_notable_story",
  ): TopRead => promotedPost({
    selected,
    cardKind,
    evidenceById,
    stories: params.topStories ?? [],
  });
  const admittedIds = new Set(
    [...selection.top, ...selection.additional].flatMap((selected) => [
      selected.candidate.candidateId,
      ...selected.support.map((support) => support.candidateId),
    ]),
  );
  const topReads = selection.top.map((selected) =>
    materialize(selected, "curated_top_read"),
  );
  const additionalPosts = selection.additional.map((selected) =>
    materialize(selected, "additional_notable_story"),
  );
  const attestations = params.attestationBinding === undefined
    ? []
    : params.editorialSlate === undefined
      ? requireEmptyPromotionSelection(selection)
      : buildReaderPostPromotionAttestations(selection, {
          ...params.attestationBinding,
          editorialSlate: params.editorialSlate,
        });
  const attestedEvidenceFacts = [...selection.top, ...selection.additional]
    .flatMap((selected) => [selected.candidate, ...selected.support]);
  const admittedCitationIds = new Set(
    [...topReads, ...additionalPosts].flatMap((post) => post.citationIds),
  );
  const admittedEvidence = params.evidence.filter((item) =>
    admittedIds.has(item.feedItemId),
  );

  return {
    topReads,
    additionalPosts,
    admittedEvidence,
    admittedCitations: params.citations.filter((citation) =>
      admittedIds.has(citation.feedItemId) &&
      admittedCitationIds.has(citation.citationId),
    ),
    admittedClusters: projectReaderPostPromotionAdmittedClusters(
      params.clusters,
      admittedEvidence,
      [...selection.top, ...selection.additional],
    ),
    topClusterIds: new Set(selection.top.flatMap((selected) =>
      selected.candidate.clusterId === undefined
        ? []
        : [selected.candidate.clusterId],
    )),
    attestations,
    attestedEvidenceFacts,
    evaluatedEvidence: inputs.map((input) => ({
      candidateId: input.candidateId,
      decision: decisionByCandidateId.get(input.candidateId)?.decision ??
        "reject",
    })),
  };
};

const requireEmptyPromotionSelection = (
  selection: ReturnType<typeof selectReaderPostPromotions>,
): readonly ReaderPostPromotionAttestation[] => {
  if (selection.top.length > 0 || selection.additional.length > 0) {
    throw new Error(
      "Promotion attestations require the backend editorial slate",
    );
  }
  return [];
};

const promotedPost = (params: {
  readonly selected: SelectedReaderPostPromotion;
  readonly cardKind: "curated_top_read" | "additional_notable_story";
  readonly evidenceById: ReadonlyMap<string, SummaryEvidenceItem>;
  readonly stories: readonly TopReadCandidate[];
}): TopRead => {
  const lead = requiredEvidence(
    params.evidenceById,
    params.selected.candidate.candidateId,
  );
  const admitted = [
    lead,
    ...params.selected.support.map((support) =>
      requiredEvidence(params.evidenceById, support.candidateId),
    ),
  ];
  const confirmedProviderKeys = [...new Set(admitted.map((item) =>
    readerSummaryIndependentProviderFamily(item)))]
    .sort((left, right) => left.localeCompare(right));
  const interestIds = compactUnique(admitted.map((item) => item.interestId));
  const title = buildReaderPostPromotionTitle({ lead });
  const whyImportant = buildReaderPostPromotionReasons({
    selected: params.selected,
    lead,
    stories: params.stories,
  });
  const confidenceScore = params.selected.confidence;

  return {
    storyClusterId: params.selected.candidate.clusterId ??
      `promotion:${params.selected.candidate.canonicalIdentity}`,
    cardKind: params.cardKind,
    promotionMarker: "reader_post_promotion",
    promotionPolicyVersion: params.selected.editorialSlateEntry === undefined
      ? READER_POST_PROMOTION_POLICY_V1.version
      : READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION,
    promotionTier: params.cardKind === "curated_top_read" ? "top" : "additional",
    promotionCandidateId: params.selected.candidate.candidateId,
    promotionCanonicalIdentity: params.selected.candidate.canonicalIdentity,
    ...(params.selected.editorialSlateEntry === undefined
      ? {}
      : {
          editorialPolicyVersion:
            params.selected.editorialSlateEntry.policyVersion,
          editorialPlacement:
            params.selected.editorialSlateEntry.placement,
          editorialSlot: params.selected.editorialSlateEntry.slot,
          editorialScoreComponents:
            params.selected.editorialSlateEntry.scoreComponents,
          editorialReasonCodes:
            params.selected.editorialSlateEntry.reasonCodes,
          editorialCandidateDigestInput:
            params.selected.editorialSlateEntry.candidateDigestInput,
          editorialDigestInput:
            params.selected.editorialSlateEntry.digestInput,
        }),
    title,
    providerKey: lead.providerKey,
    providerName: lead.providerName ?? lead.providerKey,
    primaryActionKind: lead.readerActionKind ?? "read_source",
    reason: whyImportant[0] ?? title,
    matchedInterestIds: interestIds.length === 0
      ? ["unknown-interest"]
      : interestIds,
    matchedRules: buildMatchedRules(
      admitted,
      interestIds.length === 0 ? ["unknown-interest"] : interestIds,
      lead.providerKey,
    ),
    signalScore: normalizeSignalScore(params.selected.normalizedStrength),
    confidence: {
      level: confidenceScore >= 0.8
        ? "high"
        : confidenceScore >= 0.55
          ? "medium"
          : "low",
      score: confidenceScore,
      rationale: params.selected.support.length === 0
        ? "Confidence uses the admitted lead evidence only."
        : `Confidence uses the admitted lead and ${params.selected.support.length} authoritative same-story support source${params.selected.support.length === 1 ? "" : "s"}.`,
    },
    confirmedProviderKeys,
    providerMetrics: uniqueProviderMetrics(admitted),
    whyImportant,
    whyNow: `Selected from ${confirmedProviderKeys.length} admitted provider famil${confirmedProviderKeys.length === 1 ? "y" : "ies"} in this summary window.`,
    publishedAt: lead.publishedAt,
    canonicalUrl: lead.canonicalUrl,
    previewMedia: lead.previewMedia,
    citationIds: params.selected.citationIds,
  };
};

const promotionRelations = (params: {
  readonly evidenceById: ReadonlyMap<string, SummaryEvidenceItem>;
  readonly inputByEvidenceId: ReadonlyMap<string, ReaderPostPromotionInput>;
  readonly approvedSameStoryRelations: readonly ApprovedSameStoryRelation[];
  readonly relatedTopicRelations: readonly RelatedTopicRelation[];
}): ReadonlyMap<string, ReaderPostPromotionInput["relation"]> => {
  const result = new Map<string, NonNullable<ReaderPostPromotionInput["relation"]>>();
  for (const relation of params.approvedSameStoryRelations) {
    const left = params.evidenceById.get(relation.leftFeedItemId);
    const right = params.evidenceById.get(relation.rightFeedItemId);
    if (left === undefined || right === undefined ||
        readerPostProviderFamily(left.providerKey) ===
          readerPostProviderFamily(right.providerKey)) continue;
    const leftInput = params.inputByEvidenceId.get(left.feedItemId);
    const rightInput = params.inputByEvidenceId.get(right.feedItemId);
    if (leftInput === undefined || rightInput === undefined) continue;
    const lead = baselineRelationLead(left, right, leftInput, rightInput);
    if (lead === undefined) continue;
    const support = lead === left ? right : left;
    const targetIdentity = lead.promotionFacts?.canonicalIdentity ?? "";
    if (targetIdentity.length === 0) continue;
    const current = result.get(support.feedItemId);
    if (current === undefined || relation.confidence > current.confidence) {
      result.set(support.feedItemId, {
        kind: "same_story",
        targetCanonicalIdentity: targetIdentity,
        confidence: relation.confidence,
        approved: true,
      });
    }
  }
  for (const relation of params.relatedTopicRelations) {
    if (result.has(relation.subjectFeedItemId)) continue;
    const target = params.evidenceById.get(relation.officialAnchorFeedItemId);
    result.set(relation.subjectFeedItemId, {
      kind: "related_topic",
      targetCanonicalIdentity: target?.promotionFacts?.canonicalIdentity ??
        target?.canonicalUrl ?? "",
      confidence: 1,
      approved: true,
    });
  }
  return result;
};

const baselineRelationLead = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
  leftInput: ReaderPostPromotionInput,
  rightInput: ReaderPostPromotionInput,
): SummaryEvidenceItem | undefined => {
  const leftEvaluation = evaluateReaderPostPromotion(leftInput);
  const rightEvaluation = evaluateReaderPostPromotion(rightInput);
  const leftEligible = isBaselinePromotable(leftEvaluation);
  const rightEligible = isBaselinePromotable(rightEvaluation);
  if (!leftEligible && !rightEligible) return undefined;
  if (leftEligible !== rightEligible) return leftEligible ? left : right;
  const tierDifference = Number(rightEvaluation.decision === "promote_top") -
    Number(leftEvaluation.decision === "promote_top");
  const leftOfficial = Number(isAttestedOfficial(left));
  const rightOfficial = Number(isAttestedOfficial(right));
  const comparison = tierDifference ||
    rightEvaluation.normalizedStrength - leftEvaluation.normalizedStrength ||
    rightOfficial - leftOfficial ||
    (right.contentQuality?.qualityScore ?? 0) -
      (left.contentQuality?.qualityScore ?? 0) ||
    left.feedItemId.localeCompare(right.feedItemId);
  return comparison <= 0 ? left : right;
};

const isBaselinePromotable = (
  evaluation: ReturnType<typeof evaluateReaderPostPromotion>,
): boolean => evaluation.decision === "promote_top" ||
  evaluation.decision === "promote_additional";

const isAttestedOfficial = (item: SummaryEvidenceItem): boolean =>
  item.promotionFacts?.authorityAttestation?.status === "attested" &&
  item.promotionFacts.authorityAttestation.official &&
  item.promotionFacts.authorityAttestation.trusted;

const uniqueEvidenceById = (
  evidence: readonly SummaryEvidenceItem[],
): ReadonlyMap<string, SummaryEvidenceItem> => {
  const result = new Map<string, SummaryEvidenceItem>();
  for (const item of evidence) {
    const id = item.feedItemId.trim();
    if (id.length === 0) throw new Error("Summary evidence id must be non-empty");
    if (result.has(id)) throw new Error(`Duplicate summary evidence id: ${id}`);
    result.set(id, item);
  }
  return result;
};

const citationByEvidenceId = (
  citations: readonly ReaderSummaryCitation[],
): ReadonlyMap<string, ReaderSummaryCitation> => {
  const result = new Map<string, ReaderSummaryCitation>();
  for (const citation of [...citations].sort((left, right) =>
    left.citationId.localeCompare(right.citationId),
  )) {
    if (!result.has(citation.feedItemId)) result.set(citation.feedItemId, citation);
  }
  return result;
};

const citationMatchesEvidence = (
  citation: ReaderSummaryCitation,
  evidence: SummaryEvidenceItem,
): boolean =>
  citation.feedItemId === evidence.feedItemId &&
  citation.sourceItemId === evidence.sourceItemId &&
  citation.providerKey === evidence.providerKey &&
  (citation.canonicalUrl === undefined ||
    citation.canonicalUrl === evidence.canonicalUrl);

const clusterMembership = (
  clusters: readonly StoryCluster[],
): ReadonlyMap<string, string> => {
  const result = new Map<string, string>();
  for (const cluster of clusters) {
    for (const id of [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds]) {
      const current = result.get(id);
      if (current !== undefined && current !== cluster.id) {
        throw new Error(`Summary evidence belongs to multiple clusters: ${id}`);
      }
      result.set(id, cluster.id);
    }
  }
  return result;
};

const requiredEvidence = (
  evidenceById: ReadonlyMap<string, SummaryEvidenceItem>,
  id: string,
): SummaryEvidenceItem => {
  const evidence = evidenceById.get(id);
  if (evidence === undefined) throw new Error(`Missing promoted evidence: ${id}`);
  return evidence;
};

const uniqueProviderMetrics = (
  evidence: readonly SummaryEvidenceItem[],
): TopRead["providerMetrics"] => {
  const seen = new Set<string>();
  return evidence.flatMap((item) => item.providerMetricLabels ?? []).filter((metric) => {
    const key = `${metric.label.trim()}\u0000${metric.value.trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
