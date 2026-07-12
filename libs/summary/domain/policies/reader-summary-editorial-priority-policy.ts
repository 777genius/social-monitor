import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import {
  independentEvidenceItems,
  independentEvidenceProviderKeys,
  readerSummaryProviderIdentity,
} from "../value-objects/reader-summary-provider-identity";
import { normalizeSignalScore } from "../value-objects/signal-score";
import { readerItemConfidence } from "../services/reader-summary-support";
import {
  compareRepresentativeEvidenceItems,
  representativeMetricStrength,
} from "./representative-evidence-selection-policy";
import { isReaderSummaryLeadEligibleEvidence } from "./reader-summary-lead-eligibility-policy";
import { hasFirstPartyOfficialEvidence } from "./reader-summary-source-authority-policy";
import { topReadCoreTopicStrength } from "./top-read-core-topic-policy";

export type ReaderSummaryEditorialPriorityProfile = {
  readonly providerKey: string;
  readonly editorialScore: number;
  readonly signalScore: number;
  readonly baseSignalScore: number;
  readonly metricStrength: number;
  readonly qualityScore: number;
  readonly coreTopicStrength: number;
  readonly confidenceLevel: "low" | "medium" | "high";
  readonly citationCount: number;
  readonly confirmedProviderCount: number;
  readonly leadEligible: boolean;
};

const primaryDiscussionProviders = new Set([
  "reddit",
  "x-twitter",
  "hacker-news",
]);

export const buildReaderSummaryEditorialPriorityProfile = (params: {
  readonly story?: TopReadCandidate;
  readonly cluster: StoryCluster | undefined;
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly citationCount?: number;
}): ReaderSummaryEditorialPriorityProfile => {
  const rankedEvidence = [...params.evidence].sort(
    compareRepresentativeEvidenceItems,
  );
  const leadEligibleEvidence = rankedEvidence.filter(
    isReaderSummaryLeadEligibleEvidence,
  );
  const profileEvidence =
    leadEligibleEvidence.length > 0 ? leadEligibleEvidence : rankedEvidence;
  const profileCluster =
    profileEvidence.length === rankedEvidence.length
      ? params.cluster
      : undefined;
  const representative = profileEvidence[0];
  const providerKey =
    representative === undefined
      ? (params.story?.providerKeys[0] ?? "unknown")
      : readerSummaryProviderIdentity(representative).providerKey;
  const independentEvidence = independentEvidenceItems(profileEvidence);
  const confirmedProviderCount =
    independentEvidenceProviderKeys(independentEvidence).length;
  const signalScore = normalizeSignalScore(
    profileCluster?.score ??
      Math.max(0, ...profileEvidence.map((item) => item.score)),
  );
  const baseSignalScore = normalizeSignalScore(
    profileCluster?.signalBreakdown?.baseScore ??
      Math.max(0, ...profileEvidence.map((item) => item.score)),
  );
  const metricStrength = Math.max(
    0,
    ...profileEvidence.map(representativeMetricStrength),
  );
  const qualityScore = meanQualityScore(profileEvidence);
  const story = params.story ?? fallbackStory(params.cluster, profileEvidence);
  const coreTopicStrength = topReadCoreTopicStrength({
    story,
    cluster: profileCluster,
    evidence: profileEvidence,
  });
  const confidence = readerItemConfidence({
    cluster: profileCluster,
    independentEvidenceCount: independentEvidence.length,
    confirmedProviderCount,
    signalScore,
    firstPartyOfficial: hasFirstPartyOfficialEvidence(profileEvidence),
  });
  const leadEligible = leadEligibleEvidence.length > 0;
  const freshnessBoost = profileCluster?.signalBreakdown?.freshnessBoost ?? 0;
  const editorialScore =
    baseSignalScore +
    Math.min(metricStrength, 24) * 0.07 +
    qualityScore * 0.5 +
    coreTopicStrength * 0.08 +
    confidenceRank(confidence.level) * 0.08 +
    Math.min(Math.max(0, confirmedProviderCount - 1), 2) * 0.1 +
    freshnessBoost * 0.5 +
    (primaryDiscussionProviders.has(providerKey) ? 0.12 : 0) +
    (leadEligible ? 0.35 : 0);

  return {
    providerKey,
    editorialScore: rounded(editorialScore),
    signalScore,
    baseSignalScore,
    metricStrength,
    qualityScore,
    coreTopicStrength,
    confidenceLevel: confidence.level,
    citationCount: params.citationCount ?? rankedEvidence.length,
    confirmedProviderCount,
    leadEligible,
  };
};

export const compareReaderSummaryEditorialPriority = (
  left: ReaderSummaryEditorialPriorityProfile,
  right: ReaderSummaryEditorialPriorityProfile,
): number =>
  Number(right.leadEligible) - Number(left.leadEligible) ||
  right.editorialScore - left.editorialScore ||
  right.baseSignalScore - left.baseSignalScore ||
  right.metricStrength - left.metricStrength ||
  right.qualityScore - left.qualityScore ||
  right.confirmedProviderCount - left.confirmedProviderCount ||
  right.citationCount - left.citationCount;

const meanQualityScore = (evidence: readonly SummaryEvidenceItem[]): number => {
  const values = evidence
    .map((item) => item.contentQuality?.qualityScore)
    .filter((value): value is number => value !== undefined);

  return values.length === 0
    ? 0.6
    : values.reduce((total, value) => total + value, 0) / values.length;
};

const fallbackStory = (
  cluster: StoryCluster | undefined,
  evidence: readonly SummaryEvidenceItem[],
): TopReadCandidate => ({
  storyClusterId: cluster?.id ?? "unknown",
  title: evidence[0]?.title ?? "Unknown story",
  summary: [
    ...(cluster?.whyImportant ?? []),
    ...evidence.flatMap((item) => item.whyImportant),
  ].join(" "),
  interestIds: cluster?.interestIds ?? evidence.map((item) => item.interestId),
  providerKeys:
    cluster?.providerKeys ?? evidence.map((item) => item.providerKey),
  citationIds: [],
});

const confidenceRank = (
  level: ReaderSummaryEditorialPriorityProfile["confidenceLevel"],
): number => (level === "high" ? 3 : level === "medium" ? 2 : 1);

const rounded = (value: number): number => Number(value.toFixed(4));
