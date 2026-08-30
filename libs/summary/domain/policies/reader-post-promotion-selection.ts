import {
  canonicalReaderPostPromotionInput,
  evaluateReaderPostPromotion,
  readerPostPromotionTimestampMicros,
  readerPostProviderFamily,
  READER_POST_PROMOTION_POLICY_V1,
  READER_POST_PROMOTION_POLICY_VERSION,
  type ReaderPostPromotionInput,
  type ReaderPostPromotionResult,
} from "./reader-post-promotion-policy";
import {
  readerPostPromotionTopProviderCap,
} from "./top-read-provider-diversity-policy";
import type { ReaderSummaryEditorialSlateEntry } from
  "../value-objects/reader-summary-editorial-slate";

export type SelectedReaderPostPromotion = {
  readonly policyVersion: typeof READER_POST_PROMOTION_POLICY_VERSION;
  readonly candidate: ReaderPostPromotionInput;
  readonly decision: "promote_top" | "promote_additional";
  readonly normalizedStrength: number;
  readonly usefulness: number;
  readonly support: readonly ReaderPostPromotionInput[];
  readonly providerCount: number;
  readonly citationIds: readonly string[];
  readonly metrics: readonly NonNullable<ReaderPostPromotionInput["metrics"]>[];
  readonly whyImportant: readonly string[];
  readonly confidence: number;
  readonly editorialSlateEntry?: ReaderSummaryEditorialSlateEntry;
};

export type ReaderPostPromotionSelection = {
  readonly policyVersion: typeof READER_POST_PROMOTION_POLICY_VERSION;
  readonly top: readonly SelectedReaderPostPromotion[];
  readonly additional: readonly SelectedReaderPostPromotion[];
  readonly decisions: readonly ReaderPostPromotionResult[];
};

type EvaluatedCandidate = {
  readonly input: ReaderPostPromotionInput;
  readonly evaluation: ReaderPostPromotionResult;
};

export const selectReaderPostPromotions = (
  inputs: readonly ReaderPostPromotionInput[],
): ReaderPostPromotionSelection => {
  assertUniqueCandidateIds(inputs);
  const evaluated = inputs.map((input) => ({
    input: canonicalReaderPostPromotionInput(input),
    evaluation: evaluateReaderPostPromotion(input),
  }));
  const decisionsById = new Map(
    evaluated.map(({ evaluation }) => [evaluation.candidateId, evaluation]),
  );
  const promotable = evaluated.filter(({ evaluation }) =>
    evaluation.decision === "promote_top" ||
    evaluation.decision === "promote_additional",
  );
  const canonicalRepresentatives = chooseSemanticRepresentatives(promotable);
  const representativeIds = new Set(
    canonicalRepresentatives.map(({ input }) => input.candidateId),
  );
  const representativeIdentities = new Set(
    canonicalRepresentatives.map(({ evaluation }) => evaluation.canonicalIdentity),
  );
  const representativeByIdentity = new Map(
    canonicalRepresentatives.map((candidate) => [
      candidate.evaluation.canonicalIdentity,
      candidate.input,
    ]),
  );
  const supportByIdentity = authoritativeSupportByIdentity({
    evaluated,
    selectedIds: representativeIds,
    selectedIdentities: representativeIdentities,
    selectedByIdentity: representativeByIdentity,
    decisionsById,
  });
  const clusterSupportByCandidateId = semanticClusterSupport({
    promotable,
    representatives: canonicalRepresentatives,
    decisionsById,
  });
  const compareWithSupport = (
    left: EvaluatedCandidate,
    right: EvaluatedCandidate,
  ): number => compareCandidates(left, right);
  const topCandidates = canonicalRepresentatives
    .filter(({ evaluation }) => evaluation.decision === "promote_top")
    .sort(compareWithSupport);
  const topProviderCount = new Set(topCandidates.flatMap(({ input }) => {
    const provider = readerPostProviderFamily(input.provider);
    return provider === undefined ? [] : [provider];
  })).size;
  const top = diverseCapped(
    topCandidates,
    READER_POST_PROMOTION_POLICY_V1.maxTop,
    readerPostPromotionTopProviderCap(topProviderCount),
  );
  const additional = diverseCapped(canonicalRepresentatives
    .filter(({ evaluation }) => evaluation.decision === "promote_additional")
    .sort(compareWithSupport), READER_POST_PROMOTION_POLICY_V1.maxAdditional);
  const materialize = (
    item: EvaluatedCandidate,
  ): SelectedReaderPostPromotion => toSelectedPromotion(
    item,
    uniqueInputs([
      ...(clusterSupportByCandidateId.get(item.input.candidateId) ?? []),
      ...(supportByIdentity.get(item.evaluation.canonicalIdentity) ?? []),
    ]),
  );

  return {
    policyVersion: READER_POST_PROMOTION_POLICY_VERSION,
    top: top.map(materialize),
    additional: additional.map(materialize),
    decisions: evaluated.map(({ evaluation }) =>
      decisionsById.get(evaluation.candidateId) ?? evaluation,
    ),
  };
};

const assertUniqueCandidateIds = (
  inputs: readonly ReaderPostPromotionInput[],
): void => {
  const seen = new Set<string>();
  for (const input of inputs) {
    const id = input.candidateId.trim();
    if (id.length === 0) {
      throw new Error("Reader post promotion candidate id must be non-empty");
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate reader post promotion candidate id: ${id}`);
    }
    seen.add(id);
  }
};

const chooseSemanticRepresentatives = (
  candidates: readonly EvaluatedCandidate[],
): readonly EvaluatedCandidate[] => {
  const byIdentity = new Map<string, EvaluatedCandidate>();
  for (const candidate of candidates) {
    const identity = semanticClusterKey(candidate.input);
    const current = byIdentity.get(identity);
    if (current === undefined || compareCanonicalCandidates(candidate, current) < 0) {
      byIdentity.set(identity, candidate);
    }
  }
  return [...byIdentity.values()];
};

const semanticClusterKey = (input: ReaderPostPromotionInput): string => {
  const clusterId = input.clusterId?.trim();
  return clusterId === undefined || clusterId.length === 0
    ? `canonical:${input.canonicalIdentity.trim()}`
    : `cluster:${clusterId}`;
};

const semanticClusterSupport = (params: {
  readonly promotable: readonly EvaluatedCandidate[];
  readonly representatives: readonly EvaluatedCandidate[];
  readonly decisionsById: Map<string, ReaderPostPromotionResult>;
}): ReadonlyMap<string, readonly ReaderPostPromotionInput[]> => {
  const representativeByCluster = new Map(params.representatives.map((item) =>
    [semanticClusterKey(item.input), item] as const));
  const result = new Map<string, ReaderPostPromotionInput[]>();
  for (const candidate of params.promotable) {
    const representative = representativeByCluster.get(semanticClusterKey(candidate.input));
    if (representative === undefined ||
        representative.input.candidateId === candidate.input.candidateId) continue;
    if (readerPostProviderFamily(candidate.input.provider) ===
        readerPostProviderFamily(representative.input.provider)) {
      params.decisionsById.set(candidate.input.candidateId, {
        ...candidate.evaluation,
        decision: "context_only",
        reason: "support_provider_not_independent",
        authoritativeSameStory: false,
      });
      continue;
    }
    const support = result.get(representative.input.candidateId) ?? [];
    support.push(candidate.input);
    result.set(representative.input.candidateId, support);
    params.decisionsById.set(candidate.input.candidateId, {
      ...candidate.evaluation,
      decision: "support_only",
      reason: "authoritative_same_story_support",
      authoritativeSameStory: true,
    });
  }
  for (const support of result.values()) {
    support.sort((left, right) =>
      comparePublishedAtDescending(left, right) ||
      left.canonicalIdentity.localeCompare(right.canonicalIdentity) ||
      left.candidateId.localeCompare(right.candidateId));
  }
  return result;
};

const diverseCapped = (
  sorted: readonly EvaluatedCandidate[],
  cap: number,
  providerCap = cap,
): readonly EvaluatedCandidate[] => {
  const selected: EvaluatedCandidate[] = [];
  const selectedIds = new Set<string>();
  const providers = new Set<string>();
  for (const candidate of sorted) {
    const provider = readerPostProviderFamily(candidate.input.provider);
    if (provider === undefined || providers.has(provider)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.input.candidateId);
    providers.add(provider);
    if (selected.length === cap) return selected;
  }
  for (const candidate of sorted) {
    if (selectedIds.has(candidate.input.candidateId)) continue;
    const provider = readerPostProviderFamily(candidate.input.provider);
    if (provider === undefined) continue;
    const providerCount = selected.reduce(
      (count, selectedCandidate) =>
        readerPostProviderFamily(selectedCandidate.input.provider) === provider
          ? count + 1
          : count,
      0,
    );
    if (providerCount >= providerCap) continue;
    selected.push(candidate);
    if (selected.length === cap) break;
  }
  return selected;
};

const uniqueInputs = (
  inputs: readonly ReaderPostPromotionInput[],
): readonly ReaderPostPromotionInput[] => {
  const byId = new Map<string, ReaderPostPromotionInput>();
  for (const input of inputs) if (!byId.has(input.candidateId)) {
    byId.set(input.candidateId, input);
  }
  return [...byId.values()];
};

const compareCanonicalCandidates = (
  left: EvaluatedCandidate,
  right: EvaluatedCandidate,
): number =>
  Number(right.evaluation.decision === "promote_top") -
    Number(left.evaluation.decision === "promote_top") ||
  (left.evaluation.decision === "promote_top"
    ? compareTopCandidates(left, right)
    : compareAdditionalCandidates(left, right));

const authoritativeSupportByIdentity = (params: {
  readonly evaluated: readonly EvaluatedCandidate[];
  readonly selectedIds: ReadonlySet<string>;
  readonly selectedIdentities: ReadonlySet<string>;
  readonly selectedByIdentity: ReadonlyMap<string, ReaderPostPromotionInput>;
  readonly decisionsById: Map<string, ReaderPostPromotionResult>;
}): ReadonlyMap<string, readonly ReaderPostPromotionInput[]> => {
  const supportByIdentity = new Map<string, ReaderPostPromotionInput[]>();
  for (const candidate of params.evaluated) {
    if (params.selectedIds.has(candidate.input.candidateId)) continue;
    const targetIdentity = supportTargetIdentity(candidate);
    const lead = targetIdentity === undefined
      ? undefined
      : params.selectedByIdentity.get(targetIdentity);
    if (targetIdentity === undefined ||
        !params.selectedIdentities.has(targetIdentity) ||
        lead === undefined ||
        readerPostProviderFamily(candidate.input.provider) ===
          readerPostProviderFamily(lead.provider) ||
        !sameSelectionWindow(candidate.input, lead) ||
        !passesSupportFloor(candidate)) continue;
    const support = supportByIdentity.get(targetIdentity) ?? [];
    support.push(candidate.input);
    supportByIdentity.set(targetIdentity, support);
    params.decisionsById.set(candidate.input.candidateId, {
      ...candidate.evaluation,
      decision: "support_only",
      reason: "authoritative_same_story_support",
      authoritativeSameStory: true,
    });
  }
  for (const support of supportByIdentity.values()) {
    support.sort((left, right) =>
      comparePublishedAtDescending(left, right) ||
      left.canonicalIdentity.localeCompare(right.canonicalIdentity) ||
      left.candidateId.localeCompare(right.candidateId),
    );
  }
  for (const candidate of params.evaluated) {
    const current = params.decisionsById.get(candidate.input.candidateId);
    if (current?.decision === "support_only" &&
        ![...supportByIdentity.values()].some((support) =>
          support.some((item) => item.candidateId === candidate.input.candidateId),
        )) {
      const targetIdentity = supportTargetIdentity(candidate);
      const lead = targetIdentity === undefined
        ? undefined
        : params.selectedByIdentity.get(targetIdentity);
      const sameProvider = lead !== undefined &&
        readerPostProviderFamily(candidate.input.provider) ===
          readerPostProviderFamily(lead.provider);
      params.decisionsById.set(candidate.input.candidateId, {
        ...current,
        decision: "context_only",
        reason: sameProvider
          ? "support_provider_not_independent"
          : "support_window_mismatch",
        authoritativeSameStory: false,
      });
    }
  }
  return supportByIdentity;
};

const sameSelectionWindow = (
  support: ReaderPostPromotionInput,
  lead: ReaderPostPromotionInput,
): boolean =>
  promotionMicros(support, "start") === promotionMicros(lead, "start") &&
  promotionMicros(support, "end") === promotionMicros(lead, "end") &&
  promotionMicros(support, "cutoff") === promotionMicros(lead, "cutoff");

const supportTargetIdentity = (
  candidate: EvaluatedCandidate,
): string | undefined => {
  if (candidate.evaluation.decision === "context_only" ||
      candidate.evaluation.decision === "reject") return undefined;
  const relation = candidate.input.relation;
  if (relation === undefined) return undefined;
  if (relation.kind !== "same_story") return undefined;
  const approved = relation.approved &&
    relation.confidence >= READER_POST_PROMOTION_POLICY_V1.sameStoryConfidenceMinimum;
  return approved ? relation.targetCanonicalIdentity.trim() : undefined;
};

const passesSupportFloor = (candidate: EvaluatedCandidate): boolean =>
  isAttestedTrustedSupport(candidate.input) &&
  candidate.evaluation.decision === "support_only";

const toSelectedPromotion = (
  lead: EvaluatedCandidate,
  support: readonly ReaderPostPromotionInput[],
): SelectedReaderPostPromotion => {
  const admitted = [lead.input, ...support];
  const providerCount = new Set(
    admitted.map((item) => readerPostProviderFamily(item.provider)),
  ).size;
  const rawConfidence = Math.min(
    1,
    lead.input.qualityScore + Math.min(
      READER_POST_PROMOTION_POLICY_V1.confidence.maxSupportBoost,
      support.length * READER_POST_PROMOTION_POLICY_V1.confidence.supportBoost,
    ),
  );
  const officialLead = isAttestedOfficial(lead.input);
  const confidence = providerCount > 1
    ? rawConfidence
    : Math.min(rawConfidence, officialLead ? 0.62 : support.length > 0 ? 0.55 : 0.42);
  return {
    policyVersion: READER_POST_PROMOTION_POLICY_VERSION,
    candidate: lead.input,
    decision: lead.evaluation.decision as "promote_top" | "promote_additional",
    normalizedStrength: lead.evaluation.normalizedStrength,
    usefulness: additionalUsefulness(lead),
    support,
    providerCount,
    citationIds: uniqueSorted(admitted.map((item) => item.citationId)),
    metrics: admitted.flatMap((item) => item.metrics === undefined
      ? []
      : [item.metrics]),
    whyImportant: uniqueSorted(admitted.flatMap((item) =>
      item.whyImportant?.trim() ? [item.whyImportant.trim()] : [],
    )),
    confidence,
  };
};

const additionalUsefulness = (
  candidate: EvaluatedCandidate,
): number => {
  const weights = READER_POST_PROMOTION_POLICY_V1.additionalUsefulnessWeights;
  return weights.normalizedStrength * candidate.evaluation.normalizedStrength +
    weights.qualityScore * candidate.input.qualityScore +
    weights.interestRelevanceScore * candidate.input.relevanceScore +
    weights.engagementIntegrityScore * candidate.input.integrityScore +
    weights.freshness * freshnessScore(candidate.input);
};

const isAttestedOfficial = (input: ReaderPostPromotionInput): boolean =>
  input.authorityAttestation?.status === "attested" &&
  input.authorityAttestation.official && input.authorityAttestation.trusted &&
  (readerPostProviderFamily(input.provider) !== "x" ||
    input.authorityAttestation.attestedBy === "source_catalog");

const isAttestedTrustedSupport = (
  input: ReaderPostPromotionInput,
): boolean => input.authorityAttestation?.status === "attested" &&
  input.authorityAttestation.trusted &&
  input.authorityAttestation.attestedBy === "source_catalog";

const freshnessScore = (input: ReaderPostPromotionInput): number => {
  const periodStart = promotionMicros(input, "start");
  const periodEnd = promotionMicros(input, "end");
  const publishedAt = promotionMicros(input, "published");
  if (periodStart === undefined || periodEnd === undefined ||
      publishedAt === undefined) return 0;
  const duration = periodEnd - periodStart;
  return duration <= 0n
    ? 0
    : Math.max(0, Math.min(
        1,
        Number(publishedAt - periodStart) / Number(duration),
      ));
};

const promotionMicros = (
  input: ReaderPostPromotionInput,
  field: "published" | "start" | "end" | "cutoff",
): bigint | undefined => readerPostPromotionTimestampMicros(
  field === "published"
    ? input.exactPublishedAt ?? input.publishedAt
    : field === "start"
      ? input.exactPeriodStart ?? input.periodStart
      : field === "end"
        ? input.exactPeriodEnd ?? input.periodEnd
        : input.exactIngestionCutoff ?? input.ingestionCutoff,
);

const comparePublishedAtDescending = (
  left: ReaderPostPromotionInput,
  right: ReaderPostPromotionInput,
): number => {
  const leftMicros = promotionMicros(left, "published");
  const rightMicros = promotionMicros(right, "published");
  if (leftMicros === undefined || rightMicros === undefined ||
      leftMicros === rightMicros) return 0;
  return rightMicros < leftMicros ? -1 : 1;
};

const compareTopCandidates = (
  left: EvaluatedCandidate,
  right: EvaluatedCandidate,
): number =>
  additionalUsefulness(right) - additionalUsefulness(left) ||
  comparePublishedAtDescending(left.input, right.input) ||
  left.evaluation.canonicalIdentity.localeCompare(
    right.evaluation.canonicalIdentity,
  ) ||
  left.input.candidateId.localeCompare(right.input.candidateId);

const compareAdditionalCandidates = (
  left: EvaluatedCandidate,
  right: EvaluatedCandidate,
): number =>
  additionalUsefulness(right) - additionalUsefulness(left) ||
  comparePublishedAtDescending(left.input, right.input) ||
  left.evaluation.canonicalIdentity.localeCompare(
    right.evaluation.canonicalIdentity,
  ) ||
  left.input.candidateId.localeCompare(right.input.candidateId);

const compareCandidates = (
  left: EvaluatedCandidate,
  right: EvaluatedCandidate,
): number =>
  additionalUsefulness(right) - additionalUsefulness(left) ||
  comparePublishedAtDescending(left.input, right.input) ||
  left.evaluation.canonicalIdentity.localeCompare(
    right.evaluation.canonicalIdentity,
  ) ||
  left.input.candidateId.localeCompare(right.input.candidateId);

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));
