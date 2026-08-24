import type { ReaderSummaryContent } from "../entities/reader-summary-artifact";
import type { TopRead } from "../entities/top-read";

export const collectReaderSummaryTechnicalLeaks = (
  values: readonly string[],
): readonly string[] => unique(
  values.filter((value) =>
    technicalLeakPatterns.some((pattern) => pattern.test(value)),
  ),
);

export const collectReaderSummaryUserFacingTechnicalLeaks = (
  content: ReaderSummaryContent,
): readonly string[] => collectReaderSummaryTechnicalLeaks([
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
]);

const topReadUserFacingText = (item: TopRead): readonly string[] => [
  item.title,
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
