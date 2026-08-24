import type { ProviderMetric } from "./provider-metric-label";
import type { SummaryEvidenceContentQuality } from "./summary-evidence-item";
import { isFirstPartyOfficialQuality } from "../policies/reader-summary-source-authority-policy";

export type ReaderSummaryRelatedTopicRelationProps = Readonly<{
  relationId: string;
  subjectStoryClusterId: string;
  targetStoryClusterId: string;
  subjectFeedItemId: string;
  subjectProviderKey: string;
  subjectSourceItemId: string;
  subjectCanonicalUrl: string;
  subjectProviderMetrics: readonly ProviderMetric[];
  officialAnchorFeedItemId: string;
  officialAnchorProviderKey: string;
  officialAnchorSourceItemId: string;
  officialAnchorContentQuality: SummaryEvidenceContentQuality;
  subjectIsOfficial: false;
  officialAnchorIsOfficial: true;
}>;

export class ReaderSummaryRelatedTopicRelation {
  private readonly props: ReaderSummaryRelatedTopicRelationProps;

  private constructor(props: ReaderSummaryRelatedTopicRelationProps) {
    this.props = props;
  }

  static create(
    props: Omit<
      ReaderSummaryRelatedTopicRelationProps,
      "relationId" | "subjectIsOfficial" | "officialAnchorIsOfficial"
    >,
  ): ReaderSummaryRelatedTopicRelation {
    return ReaderSummaryRelatedTopicRelation.rehydrate({
      ...props,
      relationId: stableReaderSummaryRelatedTopicRelationId(props),
      subjectIsOfficial: false,
      officialAnchorIsOfficial: true,
    });
  }

  static rehydrate(
    props: ReaderSummaryRelatedTopicRelationProps,
  ): ReaderSummaryRelatedTopicRelation {
    const normalized = normalizeRelation(props);
    if (
      normalized.subjectStoryClusterId === normalized.targetStoryClusterId
    ) {
      throw new Error("Related topic relation must be direct across two clusters");
    }
    if (
      normalized.subjectIsOfficial !== false ||
      normalized.officialAnchorIsOfficial !== true ||
      !isFirstPartyOfficialQuality(normalized.officialAnchorContentQuality)
    ) {
      throw new Error("Related topic relation must have exactly one official anchor side");
    }
    const expectedId = stableReaderSummaryRelatedTopicRelationId(normalized);
    if (normalized.relationId !== expectedId) {
      throw new Error("Related topic relation id does not match its source identity");
    }
    return new ReaderSummaryRelatedTopicRelation(Object.freeze(normalized));
  }

  toSnapshot(): ReaderSummaryRelatedTopicRelationProps {
    return this.props;
  }
}

export const stableReaderSummaryRelatedTopicRelationId = (identity: {
  readonly subjectProviderKey: string;
  readonly subjectSourceItemId: string;
  readonly officialAnchorProviderKey: string;
  readonly officialAnchorSourceItemId: string;
}): string => {
  const parts = [
    normalizedProvider(identity.subjectProviderKey),
    required(identity.subjectSourceItemId, "subject source item id"),
    normalizedProvider(identity.officialAnchorProviderKey),
    required(identity.officialAnchorSourceItemId, "official anchor source item id"),
  ];
  return `related-topic:v1:${parts.map(encodeURIComponent).join(":")}`;
};

export const failClosedMaterializedRelatedTopicRelations = (params: {
  readonly relations: readonly ReaderSummaryRelatedTopicRelationProps[];
  readonly materializedRelationIds: readonly string[];
}): readonly ReaderSummaryRelatedTopicRelationProps[] => {
  const materializedIds = new Set(params.materializedRelationIds);
  if (materializedIds.size !== params.materializedRelationIds.length) return [];
  try {
    const relations = params.relations.map((relation) =>
      ReaderSummaryRelatedTopicRelation.rehydrate(relation).toSnapshot(),
    );
    if (new Set(relations.map((relation) => relation.relationId)).size !== relations.length) {
      return [];
    }
    const retained = relations.filter((relation) =>
      materializedIds.has(relation.relationId),
    );
    return retained.length === materializedIds.size ? retained : [];
  } catch {
    return [];
  }
};

const normalizeRelation = (
  props: ReaderSummaryRelatedTopicRelationProps,
): ReaderSummaryRelatedTopicRelationProps => ({
  relationId: required(props.relationId, "relation id"),
  subjectStoryClusterId: required(
    props.subjectStoryClusterId,
    "subject story cluster id",
  ),
  targetStoryClusterId: required(
    props.targetStoryClusterId,
    "target story cluster id",
  ),
  subjectFeedItemId: required(props.subjectFeedItemId, "subject feed item id"),
  subjectProviderKey: normalizedProvider(props.subjectProviderKey),
  subjectSourceItemId: required(props.subjectSourceItemId, "subject source item id"),
  subjectCanonicalUrl: required(props.subjectCanonicalUrl, "subject canonical url"),
  subjectProviderMetrics: Object.freeze(
    props.subjectProviderMetrics.map((metric) => Object.freeze({
      label: required(metric.label, "subject provider metric label"),
      value: required(metric.value, "subject provider metric value"),
    })),
  ),
  officialAnchorFeedItemId: required(
    props.officialAnchorFeedItemId,
    "official anchor feed item id",
  ),
  officialAnchorProviderKey: normalizedProvider(props.officialAnchorProviderKey),
  officialAnchorSourceItemId: required(
    props.officialAnchorSourceItemId,
    "official anchor source item id",
  ),
  officialAnchorContentQuality: normalizeOfficialAnchorContentQuality(
    props.officialAnchorContentQuality,
  ),
  subjectIsOfficial: props.subjectIsOfficial,
  officialAnchorIsOfficial: props.officialAnchorIsOfficial,
});

const normalizeOfficialAnchorContentQuality = (
  quality: SummaryEvidenceContentQuality,
): SummaryEvidenceContentQuality => {
  const allowedKeys = new Set([
    "qualityScore",
    "interestRelevanceScore",
    "engagementIntegrityScore",
    "eligibleForSummary",
    "eligibleForTopRead",
    "needsLlmReview",
    "decision",
    "flags",
    "reason",
  ]);
  if (
    quality === null ||
    typeof quality !== "object" ||
    Object.keys(quality).some((key) => !allowedKeys.has(key)) ||
    typeof quality.qualityScore !== "number" ||
    !Number.isFinite(quality.qualityScore) ||
    typeof quality.interestRelevanceScore !== "number" ||
    !Number.isFinite(quality.interestRelevanceScore) ||
    typeof quality.engagementIntegrityScore !== "number" ||
    !Number.isFinite(quality.engagementIntegrityScore) ||
    typeof quality.eligibleForSummary !== "boolean" ||
    typeof quality.eligibleForTopRead !== "boolean" ||
    typeof quality.needsLlmReview !== "boolean" ||
    typeof quality.decision !== "string" ||
    typeof quality.reason !== "string" ||
    !Array.isArray(quality.flags) ||
    quality.flags.some((flag) => typeof flag !== "string")
  ) {
    throw new Error("Related topic official anchor authority is malformed");
  }
  return Object.freeze({
    ...quality,
    decision: required(quality.decision, "official anchor quality decision"),
    reason: required(quality.reason, "official anchor quality reason"),
    flags: Object.freeze(quality.flags.map((flag) =>
      required(flag, "official anchor quality flag"))),
  });
};

const normalizedProvider = (value: string): string =>
  required(value, "provider key").toLocaleLowerCase("en-US");

const required = (value: string, label: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Related topic ${label} must be non-empty`);
  }
  return normalized;
};
