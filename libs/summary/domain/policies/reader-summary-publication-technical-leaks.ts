import type { ReaderSummaryContent } from "../entities/reader-summary-artifact";
import type { TopRead } from "../entities/top-read";
import { isCapturedSourceDisplayTitle } from "../services/reader-post-promotion-title";

export const collectReaderSummaryTechnicalLeaks = (
  values: readonly string[],
): readonly string[] => unique(
  values.filter((value) =>
    technicalLeakPatterns.some((pattern) => pattern.test(value)),
  ),
);

export const collectReaderSummaryUserFacingTechnicalLeaks = (
  content: ReaderSummaryContent,
): readonly string[] => {
  const capturedTitles = unique([
    ...content.topReads,
    ...(content.selectedPosts ?? []),
  ].flatMap((item) =>
    isCapturedSourceDisplayTitle(item.title, item.capturedSource, item.providerKey)
      ? [item.title]
      : [],
  ));
  return collectReaderSummaryTechnicalLeaks([
    content.headline,
    content.oneLineTakeaway,
    ...content.bullets,
    ...(content.narrativeSections ?? []).flatMap((section) => [
      section.title,
      section.text,
    ]),
    ...content.risks,
    ...content.openQuestions,
    ...content.nextActions.flatMap((item) => [item.label, item.reason]),
    ...content.topReads.flatMap(topReadUserFacingText),
    ...(content.selectedPosts ?? []).flatMap(topReadUserFacingText),
  ].filter((value) => !onlyRepeatsCapturedSourceLeaks(value, capturedTitles)));
};

const onlyRepeatsCapturedSourceLeaks = (
  value: string,
  capturedTitles: readonly string[],
): boolean => {
  const tokens = leakTokensIn(value);
  if (tokens.length === 0 || capturedTitles.length === 0) return false;
  const haystacks = capturedTitles.map((title) => title.toLowerCase());
  return tokens.every((token) =>
    haystacks.some((title) => title.includes(token.toLowerCase())));
};

const leakTokensIn = (value: string): readonly string[] => unique(
  technicalLeakPatterns.flatMap((pattern) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    return [...value.matchAll(new RegExp(pattern.source, flags))].map((match) => match[0]);
  }),
);

const topReadUserFacingText = (item: TopRead): readonly string[] => [
  // Captured source titles are provider text, not generated copy.
  ...(isCapturedSourceDisplayTitle(
    item.title,
    item.capturedSource,
    item.providerKey,
  )
    ? []
    : [item.title]),
  item.reason,
  item.whyNow,
  ...item.whyImportant,
];

const technicalLeakPatterns = [
  /\bsource item\b/i,
  /\bcanonicalurl\b/i,
  /\bsource-binding\b/i,
  /\bsourcebinding\b/i,
  /\binterest:[0-9a-f-]{8,}\b/i,
  /\bprovider:[a-z0-9_-]+\b/i,
  /\bfeed_item\b/i,
  /\bsource_item\b/i,
  /\breadersummary\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
];

const unique = <TValue>(values: readonly TValue[]): readonly TValue[] => [
  ...new Set(values),
];
