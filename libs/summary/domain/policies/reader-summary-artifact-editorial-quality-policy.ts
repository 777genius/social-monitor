import type { ReaderSummaryNarrativeSectionKind } from "../entities/reader-summary-narrative-section";
import type { ReaderSummaryCoverageMode } from "../value-objects/reader-summary-coverage-mode";
import { readerSummaryIndependentProviderFamily } from
  "../value-objects/reader-summary-provider-identity";

export type ReaderSummaryEditorialCitationSupport = {
  readonly citationId: string;
  readonly providerKey: string;
  readonly storyClusterId?: string;
};

export type ReaderSummaryEditorialNarrativeSection = {
  readonly kind: ReaderSummaryNarrativeSectionKind;
  readonly title: string;
  readonly text: string;
  readonly citationIds: readonly string[];
  readonly storyClusterId?: string;
};

export type ReaderSummaryArtifactEditorialQualityInput = {
  readonly headline: string;
  readonly coverageMode: ReaderSummaryCoverageMode;
  readonly topPostTitles: readonly string[];
  readonly citations: readonly ReaderSummaryEditorialCitationSupport[];
  readonly narrativeSections: readonly ReaderSummaryEditorialNarrativeSection[];
  readonly renderedMarkdown: string;
};

export type ReaderSummaryArtifactEditorialQualityResult = {
  readonly metrics: {
    readonly leadCount: number;
    readonly leadClusterCount: number;
    readonly leadProviderCount: number;
    readonly secondarySignalCount: number;
    readonly unresolvedCitationCount: number;
    readonly mainNarrativeProviderCount: number;
    readonly dominantProviderShare: number;
    readonly malformedMarkdownPatternCount: number;
  };
  readonly qualityGates: {
    readonly exactlyOneLead: boolean;
    readonly dailySynthesisLeadHasMultipleClusters: boolean;
    readonly dailySynthesisLeadHasMultipleProviders: boolean;
    readonly secondarySignalsUseUniqueClusters: boolean;
    readonly narrativeCitationsResolve: boolean;
    readonly headlineIsNotProviderPrefixed: boolean;
    readonly headlineIsNotCopiedFromTopPost: boolean;
    readonly mainNarrativeProviderDominanceControlled: boolean;
    readonly singleStoryLeadIsHonestlyClusterBound: boolean;
    readonly renderedMarkdownIsWellFormed: boolean;
  };
  readonly issues: readonly string[];
  readonly blockingPassed: boolean;
};

const maximumDominantProviderShare = 0.75;

const providerFramingHeadline =
  /^(?:hacker\s+news|hn|reddit|x(?:\s*\/\s*twitter)?|twitter|rss|github\s+trending)(?:\s*[:\-–—]\s*|\s+(?:discussion|discusses|post|thread|item|report|reports|chatter|says|shows)\b)/iu;

const inlineWatchBullet = /watch:(?:\*\*)?\s*[-*+]\s+\*\*/iu;
const htmlTag = /<\/?[a-z][^>\n]*>/iu;
const markdownTableDivider =
  /(?:^|\n)\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*(?:\n|$)/u;

export const evaluateReaderSummaryArtifactEditorialQuality = (
  input: ReaderSummaryArtifactEditorialQualityInput,
): ReaderSummaryArtifactEditorialQualityResult => {
  const citationById = new Map(
    input.citations.map((citation) => [citation.citationId, citation] as const),
  );
  const leads = input.narrativeSections.filter(
    (section) => section.kind === "lead",
  );
  const lead = leads.length === 1 ? leads[0] : undefined;
  const leadCitations = resolvedCitations(
    lead?.citationIds ?? [],
    citationById,
  );
  const leadClusterIds = distinctStrings(
    leadCitations.map((citation) => citation.storyClusterId),
  );
  const leadProviderKeys = distinctStrings(
    leadCitations.map((citation) => normalizeProvider(citation.providerKey)),
  );
  const secondarySignals = input.narrativeSections.filter(
    (section) => section.kind === "secondary_signal",
  );
  const secondaryClusterIds = secondarySignals
    .map((section) => section.storyClusterId?.trim())
    .filter((clusterId): clusterId is string => Boolean(clusterId));
  const citedIds = input.narrativeSections.flatMap(
    (section) => section.citationIds,
  );
  const unresolvedCitationIds = distinctStrings(
    citedIds.filter((citationId) => !citationById.has(citationId)),
  );
  const everySectionHasCitations = input.narrativeSections.every(
    (section) => section.citationIds.length > 0,
  );
  const mainNarrativeCitations = resolvedCitations(
    distinctStrings(
      input.narrativeSections
        .filter((section) => section.kind !== "watch")
        .flatMap((section) => section.citationIds),
    ),
    citationById,
  );
  const mainProviderCounts = countStrings(
    mainNarrativeCitations.map((citation) =>
      normalizeProvider(citation.providerKey),
    ),
  );
  const dominantProviderShare = ratio(
    Math.max(0, ...mainProviderCounts.values()),
    mainNarrativeCitations.length,
  );
  const copiedHeadline = input.topPostTitles.some(
    (title) =>
      normalizeReaderText(title).length > 0 &&
      normalizeReaderText(title) === normalizeReaderText(input.headline),
  );
  const markdownIssues = malformedMarkdownIssues(input.renderedMarkdown);
  const dailySynthesis = input.coverageMode === "daily_synthesis";
  const singleStoryLeadIsHonestlyClusterBound =
    input.coverageMode !== "single_story" ||
    (lead?.storyClusterId !== undefined &&
      lead.storyClusterId.trim().length > 0 &&
      leadClusterIds.length === 1 &&
      leadClusterIds[0] === lead.storyClusterId.trim());
  const qualityGates = {
    exactlyOneLead: leads.length === 1,
    dailySynthesisLeadHasMultipleClusters:
      !dailySynthesis || leadClusterIds.length >= 2,
    dailySynthesisLeadHasMultipleProviders:
      !dailySynthesis || leadProviderKeys.length >= 2,
    secondarySignalsUseUniqueClusters:
      secondaryClusterIds.length === secondarySignals.length &&
      new Set(secondaryClusterIds).size === secondaryClusterIds.length,
    narrativeCitationsResolve:
      everySectionHasCitations && unresolvedCitationIds.length === 0,
    headlineIsNotProviderPrefixed: !providerFramingHeadline.test(
      input.headline.trim(),
    ),
    headlineIsNotCopiedFromTopPost: !copiedHeadline,
    mainNarrativeProviderDominanceControlled:
      !dailySynthesis || dominantProviderShare <= maximumDominantProviderShare,
    singleStoryLeadIsHonestlyClusterBound,
    renderedMarkdownIsWellFormed: markdownIssues.length === 0,
  };
  const issues = [
    ...(qualityGates.exactlyOneLead
      ? []
      : [`Expected exactly one narrative lead, found ${leads.length}`]),
    ...(qualityGates.dailySynthesisLeadHasMultipleClusters
      ? []
      : ["Daily synthesis lead must cite at least two story clusters"]),
    ...(qualityGates.dailySynthesisLeadHasMultipleProviders
      ? []
      : ["Daily synthesis lead must cite at least two providers"]),
    ...(qualityGates.secondarySignalsUseUniqueClusters
      ? []
      : ["Secondary signals must use distinct non-empty story clusters"]),
    ...(everySectionHasCitations
      ? []
      : ["Every narrative section must cite evidence"]),
    ...unresolvedCitationIds.map(
      (citationId) => `Narrative citation does not resolve: ${citationId}`,
    ),
    ...(qualityGates.headlineIsNotProviderPrefixed
      ? []
      : ["Headline uses provider-first source framing"]),
    ...(qualityGates.headlineIsNotCopiedFromTopPost
      ? []
      : ["Headline copies a top-post title"]),
    ...(qualityGates.mainNarrativeProviderDominanceControlled
      ? []
      : ["One provider supplies more than 75% of main narrative citations"]),
    ...(qualityGates.singleStoryLeadIsHonestlyClusterBound
      ? []
      : ["Single-story lead is not bound to exactly one cited story cluster"]),
    ...markdownIssues,
  ];

  return {
    metrics: {
      leadCount: leads.length,
      leadClusterCount: leadClusterIds.length,
      leadProviderCount: leadProviderKeys.length,
      secondarySignalCount: secondarySignals.length,
      unresolvedCitationCount: unresolvedCitationIds.length,
      mainNarrativeProviderCount: mainProviderCounts.size,
      dominantProviderShare,
      malformedMarkdownPatternCount: markdownIssues.length,
    },
    qualityGates,
    issues,
    blockingPassed: Object.values(qualityGates).every(Boolean),
  };
};

const malformedMarkdownIssues = (markdown: string): readonly string[] => {
  const boldDelimiterCount = markdown.match(/\*\*/gu)?.length ?? 0;

  return [
    ...(inlineWatchBullet.test(markdown)
      ? ["Rendered Markdown contains an inline nested Watch bullet"]
      : []),
    ...(boldDelimiterCount % 2 === 0
      ? []
      : ["Rendered Markdown contains unbalanced bold delimiters"]),
    ...(htmlTag.test(markdown)
      ? ["Rendered Markdown contains an HTML tag"]
      : []),
    ...(markdownTableDivider.test(markdown)
      ? ["Rendered Markdown contains a table"]
      : []),
  ];
};

const resolvedCitations = (
  citationIds: readonly string[],
  citationById: ReadonlyMap<string, ReaderSummaryEditorialCitationSupport>,
): readonly ReaderSummaryEditorialCitationSupport[] =>
  citationIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryEditorialCitationSupport =>
        citation !== undefined,
    );

const distinctStrings = (
  values: readonly (string | undefined)[],
): readonly string[] => [
  ...new Set(values.map((value) => value?.trim()).filter(isNonEmptyString)),
];

const isNonEmptyString = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0;

const normalizeProvider = (value: string): string =>
  readerSummaryIndependentProviderFamily({ providerKey: value });

const normalizeReaderText = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[*_`#~[\]<>]/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");

const countStrings = (
  values: readonly string[],
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const value of values.filter(isNonEmptyString)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
};

const ratio = (value: number, total: number): number =>
  total === 0 ? 0 : Math.round((value / total) * 1000) / 1000;
