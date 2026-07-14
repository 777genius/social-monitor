import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import {
  buildReaderSummaryEditorialPriorityProfile,
  compareReaderSummaryEditorialPriority,
  type ReaderSummaryEditorialPriorityProfile,
} from "../policies/reader-summary-editorial-priority-policy";
import { independentEvidenceProviderKeys } from "../value-objects/reader-summary-provider-identity";
import type { ReaderSummaryCoverageMode } from "../value-objects/reader-summary-coverage-mode";

export type { ReaderSummaryCoverageMode } from "../value-objects/reader-summary-coverage-mode";

export type ReaderSummaryCoverageRole = "lead" | "secondary";

export type ReaderSummaryCoveragePlanItem = {
  readonly role: ReaderSummaryCoverageRole;
  readonly clusterId: string;
  readonly score: number;
  readonly feedItemIds: readonly string[];
  readonly providerKeys: readonly string[];
  readonly interestIds: readonly string[];
  readonly whyImportant: readonly string[];
};

export type ReaderSummaryCoveragePlan = {
  readonly mode: ReaderSummaryCoverageMode;
  readonly lead?: ReaderSummaryCoveragePlanItem;
  readonly secondary: readonly ReaderSummaryCoveragePlanItem[];
};

type CoverageCandidate = ReaderSummaryCoveragePlanItem & {
  readonly topicTokens: readonly string[];
  readonly qualityScore: number;
  readonly editorialPriority: ReaderSummaryEditorialPriorityProfile;
};

const maxSecondarySignals = 3;
const minimumSecondaryScore = 0.65;
const relativeSecondaryScoreFloor = 0.3;
const nearDuplicateSimilarity = 0.62;
const materiallyStrongerSingleSourceSignalRatio = 1.25;
const dailySynthesisMinimumSignalScore = 1.25;
const dailySynthesisRelativeSignalFloor = 0.45;
const dominantMajorEventSignalRatio = 1.5;

export const buildReaderSummaryCoveragePlan = (
  selection: SummaryEvidenceSelection,
): ReaderSummaryCoveragePlan => {
  const evidenceById = new Map(
    selection.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const candidates = selection.clusters
    .map((cluster) => coverageCandidate(cluster, evidenceById))
    .filter(
      (candidate): candidate is CoverageCandidate => candidate !== undefined,
    )
    .sort(compareCoverageCandidates);
  const primaryCandidates = candidates.filter(
    (candidate) => !isGitHubOnlyCandidate(candidate),
  );
  const eligibleCandidates =
    primaryCandidates.length > 0 ? primaryCandidates : candidates;
  const lead = selectCoverageLead(eligibleCandidates);
  if (lead === undefined) {
    return { mode: "single_story", secondary: [] };
  }

  const minimumScore = Math.max(
    minimumSecondaryScore,
    lead.score * relativeSecondaryScoreFloor,
  );
  const secondary: CoverageCandidate[] = [];
  const remaining = eligibleCandidates
    .filter((candidate) => candidate.clusterId !== lead.clusterId)
    .filter(
      (candidate) =>
        candidate.score >= minimumScore && candidate.qualityScore >= 0.45,
    );
  while (secondary.length < maxSecondarySignals && remaining.length > 0) {
    const selected = [lead, ...secondary];
    const next = remaining
      .filter(
        (candidate) => !selected.some((item) => nearDuplicate(item, candidate)),
      )
      .sort(
        (left, right) =>
          marginalCoverageScore(right, selected, lead.score) -
            marginalCoverageScore(left, selected, lead.score) ||
          compareCoverageCandidates(left, right),
      )[0];
    if (next === undefined) {
      break;
    }
    secondary.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }

  return {
    mode: coverageMode(lead, secondary),
    lead: publicPlanItem(lead, "lead"),
    secondary: secondary.map((candidate) =>
      publicPlanItem(candidate, "secondary"),
    ),
  };
};

const coverageMode = (
  lead: CoverageCandidate,
  secondary: readonly CoverageCandidate[],
): ReaderSummaryCoverageMode => {
  const strongestDistinctSignal = [...secondary]
    .filter(
      (candidate) =>
        candidate.qualityScore >= 0.6 &&
        hasProviderDiversity(lead, candidate) &&
        candidate.editorialPriority.signalScore >=
          dailySynthesisMinimumSignalScore &&
        candidate.editorialPriority.signalScore >=
          lead.editorialPriority.signalScore *
            dailySynthesisRelativeSignalFloor,
    )
    .sort(
      (left, right) =>
        right.editorialPriority.signalScore -
        left.editorialPriority.signalScore,
    )[0];
  if (strongestDistinctSignal === undefined) {
    return "single_story";
  }

  const hasDominantMajorEvent =
    lead.editorialPriority.authoritativeLead &&
    lead.editorialPriority.signalScore >=
      strongestDistinctSignal.editorialPriority.signalScore *
        dominantMajorEventSignalRatio;

  return hasDominantMajorEvent ? "single_story" : "daily_synthesis";
};

const hasProviderDiversity = (
  left: CoverageCandidate,
  right: CoverageCandidate,
): boolean => new Set([...left.providerKeys, ...right.providerKeys]).size >= 2;

const selectCoverageLead = (
  candidates: readonly CoverageCandidate[],
): CoverageCandidate | undefined => {
  const authoritativeCandidates = candidates.filter(
    (candidate) => candidate.editorialPriority.authoritativeLead,
  );
  const eligibleCandidates =
    authoritativeCandidates.length > 0
      ? authoritativeCandidates
      : candidates.filter(
          (candidate) => candidate.editorialPriority.leadEligible,
        );
  const highestPriority = eligibleCandidates[0];
  if (
    highestPriority === undefined ||
    highestPriority.editorialPriority.confirmedProviderCount > 1
  ) {
    return highestPriority;
  }

  const independentlyConfirmed = eligibleCandidates.find(
    (candidate) => candidate.editorialPriority.confirmedProviderCount > 1,
  );
  if (independentlyConfirmed === undefined) {
    return highestPriority;
  }

  return highestPriority.editorialPriority.signalScore >=
    independentlyConfirmed.editorialPriority.signalScore *
      materiallyStrongerSingleSourceSignalRatio
    ? highestPriority
    : independentlyConfirmed;
};

const isGitHubOnlyCandidate = (candidate: CoverageCandidate): boolean =>
  candidate.providerKeys.length > 0 &&
  candidate.providerKeys.every((providerKey) =>
    providerKey.toLocaleLowerCase("en-US").startsWith("github"),
  );

const coverageCandidate = (
  cluster: StoryCluster,
  evidenceById: ReadonlyMap<string, SummaryEvidenceItem>,
): CoverageCandidate | undefined => {
  const evidence = [
    cluster.representativeFeedItemId,
    ...cluster.duplicateFeedItemIds,
  ]
    .map((feedItemId) => evidenceById.get(feedItemId))
    .filter((item): item is SummaryEvidenceItem => item !== undefined)
    .filter((item) => item.contentQuality?.eligibleForSummary !== false);
  if (evidence.length === 0) {
    return undefined;
  }

  const qualityScores = evidence
    .map((item) => item.contentQuality?.qualityScore)
    .filter((score): score is number => score !== undefined);
  const qualityScore =
    qualityScores.length === 0
      ? 0.6
      : qualityScores.reduce((sum, score) => sum + score, 0) /
        qualityScores.length;
  const editorialPriority = buildReaderSummaryEditorialPriorityProfile({
    cluster,
    evidence,
  });

  return {
    role: "secondary",
    clusterId: cluster.id,
    score: cluster.score,
    qualityScore,
    editorialPriority,
    feedItemIds: evidence.map((item) => item.feedItemId),
    providerKeys: independentEvidenceProviderKeys(evidence),
    interestIds: unique([
      ...cluster.interestIds,
      ...evidence.map((item) => item.interestId),
    ]),
    whyImportant: unique([
      ...cluster.whyImportant,
      ...evidence.flatMap((item) => item.whyImportant),
    ]).slice(0, 4),
    topicTokens: topicTokens(evidence),
  };
};

const compareCoverageCandidates = (
  left: CoverageCandidate,
  right: CoverageCandidate,
): number =>
  compareReaderSummaryEditorialPriority(
    left.editorialPriority,
    right.editorialPriority,
  ) ||
  right.score - left.score ||
  right.qualityScore - left.qualityScore ||
  right.providerKeys.length - left.providerKeys.length ||
  left.clusterId.localeCompare(right.clusterId);

const nearDuplicate = (
  left: CoverageCandidate,
  right: CoverageCandidate,
): boolean => {
  const leftTokens = new Set(left.topicTokens);
  const rightTokens = new Set(right.topicTokens);
  const shared = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const similarity = union === 0 ? 0 : shared / union;

  return shared >= 2 && similarity >= nearDuplicateSimilarity;
};

const marginalCoverageScore = (
  candidate: CoverageCandidate,
  selected: readonly CoverageCandidate[],
  leadScore: number,
): number => {
  const selectedProviders = new Set(
    selected.flatMap((item) => item.providerKeys),
  );
  const selectedInterests = new Set(
    selected.flatMap((item) => item.interestIds),
  );
  const relevance =
    leadScore <= 0 ? 0 : Math.min(1, candidate.score / leadScore);
  const providerNovelty = candidate.providerKeys.some(
    (provider) => !selectedProviders.has(provider),
  )
    ? 1
    : 0;
  const interestNovelty = candidate.interestIds.some(
    (interest) => !selectedInterests.has(interest),
  )
    ? 1
    : 0;
  const topicNovelty = 1 - maximumTopicSimilarity(candidate, selected);

  return (
    relevance * 0.55 +
    candidate.qualityScore * 0.2 +
    topicNovelty * 0.15 +
    providerNovelty * 0.06 +
    interestNovelty * 0.04
  );
};

const maximumTopicSimilarity = (
  candidate: CoverageCandidate,
  selected: readonly CoverageCandidate[],
): number =>
  selected.reduce(
    (maximum, item) => Math.max(maximum, topicSimilarity(candidate, item)),
    0,
  );

const topicSimilarity = (
  left: CoverageCandidate,
  right: CoverageCandidate,
): number => {
  const leftTokens = new Set(left.topicTokens);
  const rightTokens = new Set(right.topicTokens);
  const shared = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : shared / union;
};

const topicTokens = (
  evidence: readonly SummaryEvidenceItem[],
): readonly string[] =>
  unique(
    evidence.flatMap((item) =>
      `${item.title} ${item.bodyPreview ?? ""}`
        .toLocaleLowerCase("en-US")
        .replace(/[^\p{Letter}\p{Number}+#.\s-]+/gu, " ")
        .split(/\s+/u)
        .filter((token) => token.length >= 4)
        .filter((token) => !genericTopicTokens.has(token)),
    ),
  ).slice(0, 28);

const publicPlanItem = (
  candidate: CoverageCandidate,
  role: ReaderSummaryCoverageRole,
): ReaderSummaryCoveragePlanItem => ({
  role,
  clusterId: candidate.clusterId,
  score: candidate.score,
  feedItemIds: candidate.feedItemIds,
  providerKeys: candidate.providerKeys,
  interestIds: candidate.interestIds,
  whyImportant: candidate.whyImportant,
});

const unique = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

const genericTopicTokens = new Set([
  "about",
  "after",
  "agent",
  "agents",
  "also",
  "from",
  "have",
  "model",
  "models",
  "more",
  "news",
  "post",
  "posts",
  "social",
  "source",
  "story",
  "that",
  "their",
  "this",
  "tooling",
  "users",
  "what",
  "when",
  "with",
]);
