import {
  readerSummaryNarrativeSectionKinds,
  type ReaderSummaryNarrativeSection,
} from "../../domain";

export const maxNarrativeSections = 7;

export const canonicalNarrativeOrder = (
  sections: readonly ReaderSummaryNarrativeSection[],
): readonly ReaderSummaryNarrativeSection[] => {
  const order = new Map(
    readerSummaryNarrativeSectionKinds.map((kind, index) => [kind, index]),
  );

  return [...sections]
    .sort(
      (left, right) =>
        (order.get(left.kind) ?? 99) - (order.get(right.kind) ?? 99),
    )
    .filter(
      (section, index, all) =>
        section.kind === "secondary_signal" ||
        all.findIndex((candidate) => candidate.kind === section.kind) === index,
    )
    .filter(
      (section, index) =>
        section.kind !== "secondary_signal" || index < maxNarrativeSections,
    )
    .slice(0, maxNarrativeSections);
};
