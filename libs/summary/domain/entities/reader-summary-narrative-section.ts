export const readerSummaryNarrativeSectionKinds = [
  "lead",
  "main_signal",
  "why_it_matters",
  "secondary_signal",
  "watch",
] as const;

export type ReaderSummaryNarrativeSectionKind =
  (typeof readerSummaryNarrativeSectionKinds)[number];

export type ReaderSummaryNarrativeSection = {
  readonly id: string;
  readonly kind: ReaderSummaryNarrativeSectionKind;
  readonly title: string;
  readonly text: string;
  readonly citationIds: readonly string[];
  readonly storyClusterId?: string;
};
