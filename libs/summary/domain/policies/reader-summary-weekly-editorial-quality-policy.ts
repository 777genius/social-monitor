import {
  assertReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyClaimType,
  type ReaderSummaryWeeklyModelCitation,
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelObservation,
  type ReaderSummaryWeeklyModelOutput,
} from "../../ports/reader-summary-weekly-model.port";
import { assessReaderSummaryWeeklyStorySynthesis } from "./reader-summary-story-identity-policy";

export const readerSummaryWeeklyEditorialQualityPolicyVersion =
  "reader_summary.weekly_editorial_quality.v2" as const;

export type ReaderSummaryWeeklyEditorialQualityMetrics = Readonly<{
  leadSectionCount: number;
  crossDayStoryCount: number;
  synthesizedCrossDayStoryCount: number;
  duplicateSameDayStoryObservationCount: number;
  citedDayCount: number;
  citedProviderCount: number;
  dominantDayCitationShare: number;
  dominantProviderCitationShare: number;
  dayHeadingCount: number;
  dailyChronologyMarkerCount: number;
  singleDaySectionCount: number;
  unsupportedClaimCount: number;
  prohibitedEditorialPatternCount: number;
}>;

export type ReaderSummaryWeeklyEditorialQualityGates = Readonly<{
  exactlyOneLeadSection: boolean;
  stableStoryIdentityIsUsed: boolean;
  sameDayStoryObservationsAreUnique: boolean;
  weeklySynthesisModeIsGrounded: boolean;
  factualContentIsCited: boolean;
  citationsSpanMultipleProviders: boolean;
  citationsSpanAtLeastThreeDays: boolean;
  providerDominanceIsControlled: boolean;
  dayDominanceIsControlled: boolean;
  synthesisCitationsSpanMultipleProviders: boolean;
  synthesisCitationsSpanAtLeastThreeDays: boolean;
  synthesisProviderDominanceIsControlled: boolean;
  synthesisDayDominanceIsControlled: boolean;
  weeklySynthesisIsCoherent: boolean;
  readerTextAvoidsProviderInventory: boolean;
  readerTextAvoidsProcessProse: boolean;
  claimLanguageIsSupported: boolean;
}>;

export type ReaderSummaryWeeklyEditorialQualityResult = Readonly<{
  policyVersion: typeof readerSummaryWeeklyEditorialQualityPolicyVersion;
  publicationDecision: "allow" | "block";
  metrics: ReaderSummaryWeeklyEditorialQualityMetrics;
  qualityGates: ReaderSummaryWeeklyEditorialQualityGates;
  issues: readonly string[];
  blockingPassed: boolean;
}>;

type CitedTextUnit = Readonly<{
  label: string;
  text: string;
  citationIds: readonly string[];
  requiredClaimType?: ReaderSummaryWeeklyClaimType;
}>;

const maximumDominantCitationNumerator = 2;
const maximumDominantCitationDenominator = 3;

const weekdayHeading =
  /(?:^|\n)\s*(?:(?:#{1,6}|[-*+])\s*)?(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|day\s*[1-7]|\d{4}-\d{2}-\d{2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?)(?:\s*(?:[:\-–—]|\n|$))/gimu;
const dailyChronologyMarker =
  /\b(?:on\s+)?(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|day\s*[1-7]|\d{4}-\d{2}-\d{2})\b/giu;
const stitchedDailyNarrative =
  /\b(?:day\s*[1-7]|daily\s+(?:digest|summary|roundup)|seven\s+daily\s+(?:digests|summaries)|day[- ]by[- ]day|each\s+day(?:'s)?\s+(?:digest|summary))\b/giu;
const providerInventory =
  /\b(?:provider|source)\s+(?:inventory|breakdown|count|coverage|mix)\b|\b(?:we|the system|this summary)\s+(?:reviewed|selected|processed|scanned)\s+(?:sources|providers|items)\b|(?:^|\n)\s*(?:[-*]\s*)?(?:github(?:\s+trending)?|hacker\s+news|hn|reddit|rss|x(?:\/twitter)?|twitter)\s*[:=–—-]\s*\d+\b/gimu;
const processProse =
  /\b(?:selected evidence|evidence selection|evidence (?:inventory|payload|set)|quality gate|model (?:input|output)|prompt rules?|schema version|json schema|seal(?:ed)? (?:input|manifest|evidence)|token budget|telemetry|provider count|certification status|citation (?:ids?|map))\b/giu;
const promptInjectionProse =
  /\b(?:ignore|disregard|forget|override)\s+(?:(?:all|any|the|these|those|your|previous|prior|above|system|developer)\s+){0,3}(?:instructions?|prompts?|rules?)\b|\b(?:reveal|expose|print|repeat|leak)\s+(?:the\s+)?(?:system|developer|hidden|secret)\s+(?:prompt|instructions?|message|secrets?)\b|\b(?:system|developer|hidden)\s+(?:prompt|instructions?|message)\b/giu;
const evolutionLanguage =
  /\b(?:accelerat(?:e|ed|es|ing)|became|by\s+(?:the\s+)?week(?:'s)?\s+end|declin(?:e|ed|es|ing)|evolv(?:e|ed|es|ing)|fad(?:e|ed|es|ing)|followed\s+by|grew|growing|increas(?:e|ed|es|ing)|later|momentum|moved\s+from|rose|shift(?:ed|ing|s)?|slowed?|subsequently|surged?|transition(?:ed|ing|s)?|trend(?:ed|ing|s)?|week[- ]over[- ]week)\b/iu;
const resolutionLanguage =
  /\b(?:closed|completed|concluded|finalized|finished|fixed|generally\s+available|launched|released|resolved|settled|shipped|solved|went\s+live)\b|\b(?:confirmed|established|reached)\s+(?:a|the)\s+(?:definitive|final)\s+(?:outcome|resolution)\b/iu;

export const evaluateReaderSummaryWeeklyEditorialQuality = (
  input: ReaderSummaryWeeklyModelInput,
  output: ReaderSummaryWeeklyModelOutput,
): ReaderSummaryWeeklyEditorialQualityResult => {
  assertReaderSummaryWeeklyModelInput(input);
  const citationById = new Map(
    input.citations.map((citation) => [citation.citationId, citation] as const),
  );
  const observationById = new Map(
    input.observations.map(
      (observation) => [observation.observationId, observation] as const,
    ),
  );
  const storySynthesis = assessReaderSummaryWeeklyStorySynthesis({
    input,
    output,
  });
  const textUnits = citedTextUnits(output);
  const citedIds = distinct(
    textUnits.flatMap((unit) => [...unit.citationIds]),
  );
  const resolvedCitations = citedIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryWeeklyModelCitation =>
        citation !== undefined,
    );
  const dayCounts = countBy(resolvedCitations, (citation) =>
    citation.observedOn,
  );
  const providerCounts = countBy(resolvedCitations, (citation) =>
    citation.providerKey,
  );
  const synthesisCitationIds = distinct(output.synthesisCitationIds);
  const synthesisCitations = synthesisCitationIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryWeeklyModelCitation =>
        citation !== undefined,
    );
  const synthesisDayCounts = countBy(
    synthesisCitations,
    (citation) => citation.observedOn,
  );
  const synthesisProviderCounts = countBy(
    synthesisCitations,
    (citation) => citation.providerKey,
  );
  const inputStoryDays = new Map<string, Set<string>>();
  for (const citation of input.citations) {
    const days = inputStoryDays.get(citation.storyId) ?? new Set<string>();
    days.add(citation.observedOn);
    inputStoryDays.set(citation.storyId, days);
  }
  const inputHasCrossDayStory = [...inputStoryDays.values()].some(
    (days) => days.size >= 2,
  );
  const thematicFallbackIsGrounded =
    !inputHasCrossDayStory &&
    synthesisProviderCounts.size >= 2 &&
    synthesisDayCounts.size >= 3 &&
    dominanceIsControlled(synthesisProviderCounts) &&
    dominanceIsControlled(synthesisDayCounts);
  const dominantDayCitationShare = dominantShare(
    dayCounts,
    resolvedCitations.length,
  );
  const dominantProviderCitationShare = dominantShare(
    providerCounts,
    resolvedCitations.length,
  );
  const completeReaderText = textUnits.map((unit) => unit.text).join("\n");
  const dayHeadingCount = matchCount(completeReaderText, weekdayHeading);
  const dailyChronologyMarkerCount = matchCount(
    completeReaderText,
    dailyChronologyMarker,
  );
  const stitchedDailyCount = matchCount(
    completeReaderText,
    stitchedDailyNarrative,
  );
  const providerInventoryCount = matchCount(
    completeReaderText,
    providerInventory,
  );
  const processProseCount = matchCount(completeReaderText, processProse);
  const promptInjectionCount = matchCount(
    completeReaderText,
    promptInjectionProse,
  );
  const singleDaySectionDates = citedSingleDaySectionDates(
    output,
    citationById,
  );
  const stitchedDailySectionCount =
    singleDaySectionDates.length >= 3 &&
    new Set(singleDaySectionDates).size >= 3
      ? 1
      : 0;
  const claimIssues = unsupportedClaimIssues(
    textUnits,
    citationById,
    observationById,
  );
  const factualContentIsCited =
    textUnits.every((unit) => unit.citationIds.length > 0) &&
    resolvedCitations.length === citedIds.length;
  const qualityGates = {
    exactlyOneLeadSection:
      output.sections.filter((section) => section.kind === "lead").length === 1,
    stableStoryIdentityIsUsed: storySynthesis.stableStoryIdentityIsUsed,
    sameDayStoryObservationsAreUnique:
      storySynthesis.sameDayStoryObservationsAreUnique,
    weeklySynthesisModeIsGrounded:
      storySynthesis.synthesizedCrossDayStoryCount > 0 ||
      thematicFallbackIsGrounded,
    factualContentIsCited,
    citationsSpanMultipleProviders: providerCounts.size >= 2,
    citationsSpanAtLeastThreeDays: dayCounts.size >= 3,
    providerDominanceIsControlled: dominanceIsControlled(providerCounts),
    dayDominanceIsControlled: dominanceIsControlled(dayCounts),
    synthesisCitationsSpanMultipleProviders:
      synthesisProviderCounts.size >= 2,
    synthesisCitationsSpanAtLeastThreeDays: synthesisDayCounts.size >= 3,
    synthesisProviderDominanceIsControlled: dominanceIsControlled(
      synthesisProviderCounts,
    ),
    synthesisDayDominanceIsControlled:
      dominanceIsControlled(synthesisDayCounts),
    weeklySynthesisIsCoherent:
      dayHeadingCount === 0 &&
      dailyChronologyMarkerCount < 3 &&
      stitchedDailyCount === 0 &&
      stitchedDailySectionCount === 0,
    readerTextAvoidsProviderInventory: providerInventoryCount === 0,
    readerTextAvoidsProcessProse:
      processProseCount === 0 && promptInjectionCount === 0,
    claimLanguageIsSupported: claimIssues.length === 0,
  } satisfies ReaderSummaryWeeklyEditorialQualityGates;
  const issues = [
    ...(qualityGates.exactlyOneLeadSection
      ? []
      : ["Weekly editorial output must contain exactly one lead section"]),
    ...(qualityGates.stableStoryIdentityIsUsed
      ? []
      : ["Weekly editorial output must preserve stable story identity"]),
    ...(qualityGates.sameDayStoryObservationsAreUnique
      ? []
      : ["Weekly evidence contains duplicate same-story same-day observations"]),
    ...(qualityGates.weeklySynthesisModeIsGrounded
      ? []
      : [
          "Weekly lead and synthesis must carry one stable story across multiple days",
        ]),
    ...(qualityGates.factualContentIsCited
      ? []
      : ["Every factual weekly field must cite known sealed evidence"]),
    ...(qualityGates.citationsSpanMultipleProviders
      ? []
      : ["Weekly editorial citations must span at least two providers"]),
    ...(qualityGates.citationsSpanAtLeastThreeDays
      ? []
      : ["Weekly editorial citations must span at least three certified days"]),
    ...(qualityGates.providerDominanceIsControlled
      ? []
      : ["Weekly editorial provider dominance is unresolved"]),
    ...(qualityGates.dayDominanceIsControlled
      ? []
      : ["Weekly editorial day dominance is unresolved"]),
    ...(qualityGates.synthesisCitationsSpanMultipleProviders
      ? []
      : ["Weekly synthesis citations must span at least two providers"]),
    ...(qualityGates.synthesisCitationsSpanAtLeastThreeDays
      ? []
      : ["Weekly synthesis citations must span at least three certified days"]),
    ...(qualityGates.synthesisProviderDominanceIsControlled
      ? []
      : ["Weekly synthesis provider dominance is unresolved"]),
    ...(qualityGates.synthesisDayDominanceIsControlled
      ? []
      : ["Weekly synthesis day dominance is unresolved"]),
    ...(dayHeadingCount === 0
      ? []
      : ["Weekly editorial output concatenates daily or dated headings"]),
    ...(dailyChronologyMarkerCount < 3
      ? []
      : ["Weekly editorial output enumerates a daily chronology"]),
    ...(stitchedDailyCount === 0
      ? []
      : ["Weekly editorial output reads as stitched daily summaries"]),
    ...(stitchedDailySectionCount === 0
      ? []
      : ["Weekly editorial output reads as stitched single-day sections"]),
    ...(qualityGates.readerTextAvoidsProviderInventory
      ? []
      : ["Weekly editorial output contains a provider inventory"]),
    ...(qualityGates.readerTextAvoidsProcessProse
      ? []
      : ["Weekly editorial output contains model or process prose"]),
    ...claimIssues,
  ];
  const blockingPassed = Object.values(qualityGates).every(Boolean);

  return Object.freeze({
    policyVersion: readerSummaryWeeklyEditorialQualityPolicyVersion,
    publicationDecision: blockingPassed ? "allow" : "block",
    metrics: Object.freeze({
      leadSectionCount: output.sections.filter(
        (section) => section.kind === "lead",
      ).length,
      crossDayStoryCount: storySynthesis.crossDayStoryCount,
      synthesizedCrossDayStoryCount:
        storySynthesis.synthesizedCrossDayStoryCount,
      duplicateSameDayStoryObservationCount:
        storySynthesis.duplicateSameDayStoryObservationCount,
      citedDayCount: dayCounts.size,
      citedProviderCount: providerCounts.size,
      dominantDayCitationShare,
      dominantProviderCitationShare,
      dayHeadingCount,
      dailyChronologyMarkerCount,
      singleDaySectionCount: singleDaySectionDates.length,
      unsupportedClaimCount: claimIssues.length,
      prohibitedEditorialPatternCount:
        stitchedDailyCount +
        stitchedDailySectionCount +
        (dailyChronologyMarkerCount >= 3 ? 1 : 0) +
        providerInventoryCount +
        processProseCount +
        promptInjectionCount,
    }),
    qualityGates: Object.freeze(qualityGates),
    issues: Object.freeze(issues),
    blockingPassed,
  });
};

export const assertReaderSummaryWeeklyEditorialPublishable = (
  input: ReaderSummaryWeeklyModelInput,
  output: ReaderSummaryWeeklyModelOutput,
): ReaderSummaryWeeklyEditorialQualityResult => {
  const result = evaluateReaderSummaryWeeklyEditorialQuality(input, output);
  if (!result.blockingPassed || result.publicationDecision !== "allow") {
    throw new ReaderSummaryWeeklyEditorialQualityError(result);
  }
  return result;
};

export class ReaderSummaryWeeklyEditorialQualityError extends Error {
  constructor(
    readonly result: ReaderSummaryWeeklyEditorialQualityResult,
  ) {
    super(
      `Reader summary weekly editorial output is blocked: ${result.issues.join(
        "; ",
      )}`,
    );
    this.name = "ReaderSummaryWeeklyEditorialQualityError";
  }
}

const citedTextUnits = (
  output: ReaderSummaryWeeklyModelOutput,
): readonly CitedTextUnit[] => [
  {
    label: "headline",
    text: output.headline,
    citationIds: output.headlineCitationIds,
  },
  {
    label: "takeaway",
    text: output.takeaway,
    citationIds: output.takeawayCitationIds,
  },
  {
    label: "synthesis",
    text: output.synthesis,
    citationIds: output.synthesisCitationIds,
  },
  ...output.stories.map((story) => ({
    label: `story ${story.storyId}`,
    text: `${story.headline}\n${story.summary}`,
    citationIds: story.citationIds,
    ...(story.status === "developing"
      ? { requiredClaimType: "evolution" as const }
      : story.status === "resolved"
        ? { requiredClaimType: "resolution" as const }
        : {}),
  })),
  ...output.sections.map((section) => ({
    label: `section ${section.sectionId}`,
    text: `${section.heading}\n${section.text}`,
    citationIds: section.citationIds,
    requiredClaimType: section.claimType,
  })),
];

const unsupportedClaimIssues = (
  units: readonly CitedTextUnit[],
  citationById: ReadonlyMap<string, ReaderSummaryWeeklyModelCitation>,
  observationById: ReadonlyMap<string, ReaderSummaryWeeklyModelObservation>,
): readonly string[] =>
  units.flatMap((unit) => {
    const observations = distinct(
      unit.citationIds
        .map((citationId) => citationById.get(citationId)?.observationId)
        .filter((value): value is string => value !== undefined),
    )
      .map((observationId) => observationById.get(observationId))
      .filter(
        (observation): observation is ReaderSummaryWeeklyModelObservation =>
          observation !== undefined,
      );
    const requiresEvolution =
      unit.requiredClaimType === "evolution" ||
      evolutionLanguage.test(unit.text);
    const requiresResolution =
      unit.requiredClaimType === "resolution" ||
      resolutionLanguage.test(unit.text);
    return [
      ...(requiresEvolution &&
      !supportsClaim(observations, "evolution")
        ? [`Weekly ${unit.label} uses unsupported evolution or trend language`]
        : []),
      ...(requiresResolution &&
      !supportsClaim(observations, "resolution")
        ? [`Weekly ${unit.label} uses unsupported resolution language`]
        : []),
    ];
  });

const supportsClaim = (
  observations: readonly ReaderSummaryWeeklyModelObservation[],
  claimType: Exclude<ReaderSummaryWeeklyClaimType, "snapshot">,
): boolean =>
  new Set(observations.map((observation) => observation.observedOn)).size >= 2 &&
  observations.some((observation) =>
    observation.claimSupport.includes(claimType),
  );

const citedSingleDaySectionDates = (
  output: ReaderSummaryWeeklyModelOutput,
  citationById: ReadonlyMap<string, ReaderSummaryWeeklyModelCitation>,
): readonly string[] =>
  output.sections
    .map((section) =>
      distinct(
        section.citationIds
          .map((citationId) => citationById.get(citationId)?.observedOn)
          .filter((date): date is string => date !== undefined),
      ),
    )
    .filter((dates) => dates.length === 1)
    .map((dates) => dates[0]!);

const countBy = <T>(
  values: readonly T[],
  keyOf: (value: T) => string,
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = keyOf(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const dominanceIsControlled = (
  counts: ReadonlyMap<string, number>,
): boolean => {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const dominant = Math.max(0, ...counts.values());
  return (
    total > 0 &&
    dominant * maximumDominantCitationDenominator <=
      total * maximumDominantCitationNumerator
  );
};

const dominantShare = (
  counts: ReadonlyMap<string, number>,
  total: number,
): number => {
  if (total === 0) {
    return 0;
  }
  const dominant = Math.max(0, ...counts.values());
  return Math.round((dominant / total) * 1_000) / 1_000;
};

const distinct = <T>(values: readonly T[]): readonly T[] => [
  ...new Set(values),
];

const matchCount = (text: string, pattern: RegExp): number =>
  text.match(pattern)?.length ?? 0;
