import type { ReaderSummaryNarrativeSection } from "../../domain";

export const narrativeDiagnostics = (params: {
  readonly rawSections: readonly Record<string, unknown>[];
  readonly validSections: readonly ReaderSummaryNarrativeSection[];
  readonly knownCitationIds: ReadonlySet<string>;
  readonly leadCitationIds: ReadonlySet<string>;
}): string => {
  const rawLeadCount = rawKindCount(params.rawSections, "lead");
  const rawMainSignalCount = rawKindCount(params.rawSections, "main_signal");
  const rawSectionsWithKnownCitations = params.rawSections.filter((section) =>
    rawCitationIds(section).some((id) => params.knownCitationIds.has(id)),
  ).length;
  const rawSectionsWithLeadCitations = params.rawSections.filter((section) =>
    rawCitationIds(section).some((id) => params.leadCitationIds.has(id)),
  ).length;

  return [
    `raw=${params.rawSections.length}`,
    `lead=${rawLeadCount}`,
    `main=${rawMainSignalCount}`,
    `knownCited=${rawSectionsWithKnownCitations}`,
    `leadCited=${rawSectionsWithLeadCitations}`,
    `valid=${params.validSections.length}`,
  ].join(",");
};

const rawKindCount = (
  sections: readonly Record<string, unknown>[],
  kind: string,
): number => sections.filter((section) => section.kind === kind).length;

const rawCitationIds = (section: Record<string, unknown>): readonly string[] =>
  Array.isArray(section.citationIds)
    ? section.citationIds.filter((id): id is string => typeof id === "string")
    : [];
