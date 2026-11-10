import {
  readerSummaryNarrativeSectionKinds,
  type ReaderSummaryNarrativeSection,
} from "../../domain";
import {
  isValidReaderSummaryNarrativeLead,
  type ReaderSummaryNarrativeCoverage,
} from "./openai-responses-reader-summary-narrative-coverage";

export const maxNarrativeSections = 7;

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

export const validSecondarySection = (
  storyClusterId: string | undefined,
  citationIds: readonly string[],
  planned: ReadonlyMap<string, ReadonlySet<string>>,
): boolean => {
  if (storyClusterId === undefined) {
    return false;
  }
  const allowed = planned.get(storyClusterId);

  return allowed !== undefined && citationIds.some((id) => allowed.has(id));
};

export const assertNarrativeCoverage = (
  sections: readonly ReaderSummaryNarrativeSection[],
  plannedSecondaryCitations: ReadonlyMap<string, ReadonlySet<string>>,
  diagnostics: string,
): void => {
  if (!sections.some((section) => section.kind === "lead")) {
    throw new Error(
      `Reader summary narrative must include a cited lead (${diagnostics})`,
    );
  }
  const secondarySections = sections.filter(
    (section) => section.kind === "secondary_signal",
  );
  const plannedClusterIds = [...plannedSecondaryCitations.keys()].slice(0, 3);
  const actualClusterIds = secondarySections
    .map((section) => section.storyClusterId)
    .filter((clusterId): clusterId is string => clusterId !== undefined);
  const missingClusterIds = plannedClusterIds.filter(
    (clusterId) => !actualClusterIds.includes(clusterId),
  );
  const duplicatedClusterIds = actualClusterIds.filter(
    (clusterId, index) => actualClusterIds.indexOf(clusterId) !== index,
  );
  if (missingClusterIds.length > 0 || duplicatedClusterIds.length > 0) {
    throw new Error(
      `Reader summary narrative does not exactly cover planned secondary signals (missing=${missingClusterIds.join(",") || "none"}, duplicated=${[...new Set(duplicatedClusterIds)].join(",") || "none"})`,
    );
  }
};

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

