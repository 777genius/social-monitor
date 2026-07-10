import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";

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
  readonly lead?: ReaderSummaryCoveragePlanItem;
  readonly secondary: readonly ReaderSummaryCoveragePlanItem[];
};

type CoverageCandidate = ReaderSummaryCoveragePlanItem & {
  readonly topicTokens: readonly string[];
  readonly qualityScore: number;
};

const maxSecondarySignals = 3;
const minimumSecondaryScore = 0.65;
const relativeSecondaryScoreFloor = 0.3;
const nearDuplicateSimilarity = 0.62;

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
  const lead = eligibleCandidates[0];
  if (lead === undefined) {
    return { secondary: [] };
  }

  const minimumScore = Math.max(
    minimumSecondaryScore,
    lead.score * relativeSecondaryScoreFloor,
  );
  const secondary: CoverageCandidate[] = [];
  for (const candidate of eligibleCandidates.slice(1)) {
    if (candidate.score < minimumScore || candidate.qualityScore < 0.45) {
      continue;
    }
    if (
      [lead, ...secondary].some((selected) =>
        nearDuplicate(selected, candidate),
      )
    ) {
      continue;
    }

    secondary.push(candidate);
    if (secondary.length === maxSecondarySignals) {
      break;
    }
  }

  return {
    lead: publicPlanItem(lead, "lead"),
    secondary: secondary.map((candidate) =>
      publicPlanItem(candidate, "secondary"),
    ),
  };
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

  return {
    role: "secondary",
    clusterId: cluster.id,
    score: cluster.score,
    qualityScore,
    feedItemIds: evidence.map((item) => item.feedItemId),
    providerKeys: unique([
      ...cluster.providerKeys,
      ...evidence.map((item) => item.providerKey),
    ]),
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
