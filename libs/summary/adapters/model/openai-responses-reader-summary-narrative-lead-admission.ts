import type { ReaderSummaryNarrativeSection } from "../../domain";
import {
  isValidReaderSummaryNarrativeLead,
  type ReaderSummaryNarrativeCoverage,
} from "./openai-responses-reader-summary-narrative-coverage";

export const ensureCitedLead = (
  sections: readonly ReaderSummaryNarrativeSection[],
  coverage: ReaderSummaryNarrativeCoverage,
  storyTitlesByClusterId: ReadonlyMap<string, string>,
): readonly ReaderSummaryNarrativeSection[] => {
  if (sections.some((section) => section.kind === "lead")) {
    return sections;
  }
  const candidate = sections.find(
    (section) =>
      section.kind === "main_signal" &&
      (coverage.mode === "daily_synthesis"
        ? section.storyClusterId === undefined
        : section.storyClusterId === undefined ||
          section.storyClusterId === coverage.leadClusterId) &&
      isValidReaderSummaryNarrativeLead(section.citationIds, coverage),
  );
  if (candidate === undefined) {
    return sections;
  }

  return sections.map((section) =>
    section === candidate
      ? {
          ...section,
          kind: "lead",
          title:
            (coverage.mode === "daily_synthesis"
              ? "Daily synthesis"
              : coverage.leadClusterId === undefined
                ? undefined
                : storyTitlesByClusterId.get(coverage.leadClusterId)) ??
            "Overview",
          ...(coverage.mode === "daily_synthesis" ||
          coverage.leadClusterId === undefined
            ? { storyClusterId: undefined }
            : { storyClusterId: coverage.leadClusterId }),
        }
      : section,
  );
};
