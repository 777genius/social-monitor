import {
  buildReaderSummaryCoveragePlan,
  readerSummaryNarrativeSectionKinds,
  type ReaderSummaryCitation,
  type ReaderSummaryNarrativeSection,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import {
  asRecord,
  knownStringSubset,
  normalizeSetValue,
  optionalString,
  requiredString,
  requiredStringArray,
} from "./openai-responses-reader-summary-json";

const narrativeKinds = new Set(readerSummaryNarrativeSectionKinds);
const maxNarrativeSections = 7;
const maxSecondarySections = 3;

export const normalizeOpenAiReaderSummaryNarrative = (params: {
  readonly rawSections: unknown;
  readonly legacyExecutiveSummary: string;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly storyTitlesByClusterId: ReadonlyMap<string, string>;
  readonly storySummariesByClusterId: ReadonlyMap<string, string>;
  readonly storySummariesByCitationId: ReadonlyMap<string, string>;
}): readonly ReaderSummaryNarrativeSection[] => {
  const rawSections = Array.isArray(params.rawSections)
    ? params.rawSections
        .map(asRecord)
        .filter((value): value is Record<string, unknown> => value !== null)
    : [];
  if (rawSections.length === 0) {
    return fallbackNarrative(params);
  }

  const knownCitationIds = new Set(
    params.citationMap.map((citation) => citation.citationId),
  );
  const coverage = coverageCitationPlan(params.input, params.citationMap);
  const sections = rawSections
    .slice(0, maxNarrativeSections)
    .flatMap((value, index): readonly ReaderSummaryNarrativeSection[] => {
      const kind = normalizeSetValue(
        value.kind,
        narrativeKinds,
        "reader summary narrative kind",
      );
      const storyClusterId = optionalString(value.storyClusterId);
      const title =
        optionalString(value.title) ??
        defaultNarrativeTitle(
          kind,
          storyClusterId,
          params.storyTitlesByClusterId,
        );
      const citationIds = knownStringSubset(
        requiredStringArray(
          value.citationIds ?? [],
          "reader summary narrative citations",
        ),
        knownCitationIds,
      ).slice(0, 3);
      const text = narrativeSectionText({
        value,
        kind,
        storyClusterId,
        citationIds,
        legacyExecutiveSummary: params.legacyExecutiveSummary,
        storySummariesByClusterId: params.storySummariesByClusterId,
        storySummariesByCitationId: params.storySummariesByCitationId,
      });
      if (
        kind === undefined ||
        text === undefined ||
        title === undefined ||
        citationIds.length === 0
      ) {
        return [];
      }
      if (
        kind === "secondary_signal" &&
        !validSecondarySection(
          storyClusterId,
          citationIds,
          coverage.secondaryCitationIds,
        )
      ) {
        return [];
      }
      if (
        kind === "lead" &&
        !citationIds.some((id) => coverage.leadCitationIds.has(id))
      ) {
        return [];
      }

      return [
        {
          id: `narrative-${index + 1}`,
          kind,
          title,
          text,
          citationIds,
          ...(storyClusterId === undefined ? {} : { storyClusterId }),
        },
      ];
    });
  const bounded = canonicalNarrativeOrder(
    ensureCitedLead(sections, coverage.leadCitationIds),
  );
  assertNarrativeCoverage(
    bounded,
    coverage.secondaryCitationIds.size,
    narrativeDiagnostics({
      rawSections,
      validSections: sections,
      knownCitationIds,
      leadCitationIds: coverage.leadCitationIds,
    }),
  );

  return bounded;
};

const narrativeSectionText = (params: {
  readonly value: Record<string, unknown>;
  readonly kind: ReaderSummaryNarrativeSection["kind"] | undefined;
  readonly storyClusterId: string | undefined;
  readonly citationIds: readonly string[];
  readonly legacyExecutiveSummary: string;
  readonly storySummariesByClusterId: ReadonlyMap<string, string>;
  readonly storySummariesByCitationId: ReadonlyMap<string, string>;
}): string | undefined =>
  optionalString(params.value.text) ??
  optionalString(params.value.summary) ??
  optionalString(params.value.body) ??
  optionalString(params.value.description) ??
  params.citationIds
    .map((citationId) =>
      optionalString(params.storySummariesByCitationId.get(citationId)),
    )
    .find((value): value is string => value !== undefined) ??
  (params.storyClusterId === undefined
    ? undefined
    : optionalString(
        params.storySummariesByClusterId.get(params.storyClusterId),
      )) ??
  (params.kind === "lead"
    ? optionalString(params.legacyExecutiveSummary)
    : undefined);

export const readerSummaryNarrativeMarkdown = (
  sections: readonly ReaderSummaryNarrativeSection[],
): string => {
  const lines: string[] = [];
  const lead = sections.find((section) => section.kind === "lead");
  if (lead !== undefined) {
    lines.push(lead.text);
  }
  for (const section of sections.filter(
    (item) => item.kind === "main_signal" || item.kind === "why_it_matters",
  )) {
    lines.push(`- **${displayLabel(section)}:** ${section.text}`);
  }
  const secondary = sections.filter(
    (section) => section.kind === "secondary_signal",
  );
  if (secondary.length > 0) {
    lines.push(
      "**Other signals today**",
      ...secondary.map((section) => `- **${section.title}:** ${section.text}`),
    );
  }
  const watch = sections.find((section) => section.kind === "watch");
  if (watch !== undefined) {
    lines.push(`- **Watch:** ${watch.text}`);
  }

  return lines.join("\n\n");
};

const fallbackNarrative = (params: {
  readonly legacyExecutiveSummary: string;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
}): readonly ReaderSummaryNarrativeSection[] => {
  const citationIds = params.citationMap
    .slice(0, 3)
    .map((item) => item.citationId);
  if (citationIds.length === 0) {
    return [];
  }

  return [
    {
      id: "narrative-1",
      kind: "lead",
      title: "Overview",
      text: requiredString(
        params.legacyExecutiveSummary,
        "reader summary executive summary",
      ),
      citationIds,
    },
  ];
};

const defaultNarrativeTitle = (
  kind: ReaderSummaryNarrativeSection["kind"] | undefined,
  storyClusterId: string | undefined,
  storyTitlesByClusterId: ReadonlyMap<string, string>,
): string | undefined => {
  switch (kind) {
    case "lead":
      return "Overview";
    case "main_signal":
      return "Main signal";
    case "why_it_matters":
      return "Why it matters";
    case "watch":
      return "Watch";
    case "secondary_signal":
      return storyClusterId === undefined
        ? undefined
        : storyTitlesByClusterId.get(storyClusterId);
    case undefined:
      return undefined;
  }
};

const coverageCitationPlan = (
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): {
  readonly leadCitationIds: ReadonlySet<string>;
  readonly secondaryCitationIds: ReadonlyMap<string, ReadonlySet<string>>;
} => {
  const citationByFeedItemId = new Map(
    citationMap.map(
      (citation) => [citation.feedItemId, citation.citationId] as const,
    ),
  );
  const plan = buildReaderSummaryCoveragePlan(input.evidence);
  const citationIdsFor = (feedItemIds: readonly string[]) =>
    new Set(
      feedItemIds
        .map((feedItemId) => citationByFeedItemId.get(feedItemId))
        .filter((id): id is string => id !== undefined),
    );

  return {
    leadCitationIds: citationIdsFor(plan.lead?.feedItemIds ?? []),
    secondaryCitationIds: new Map(
      plan.secondary.map((item) => [
        item.clusterId,
        citationIdsFor(item.feedItemIds),
      ]),
    ),
  };
};

const ensureCitedLead = (
  sections: readonly ReaderSummaryNarrativeSection[],
  leadCitationIds: ReadonlySet<string>,
): readonly ReaderSummaryNarrativeSection[] => {
  if (sections.some((section) => section.kind === "lead")) {
    return sections;
  }
  const candidate = sections.find(
    (section) =>
      section.kind === "main_signal" &&
      section.citationIds.some((id) => leadCitationIds.has(id)),
  );
  if (candidate === undefined) {
    return sections;
  }

  return sections.map((section) =>
    section === candidate
      ? { ...section, kind: "lead", title: "Overview" }
      : section,
  );
};

const validSecondarySection = (
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

const assertNarrativeCoverage = (
  sections: readonly ReaderSummaryNarrativeSection[],
  plannedSecondaryCount: number,
  diagnostics: string,
): void => {
  if (!sections.some((section) => section.kind === "lead")) {
    throw new Error(
      `Reader summary narrative must include a cited lead (${diagnostics})`,
    );
  }
  const expectedSecondaryCount = Math.min(
    plannedSecondaryCount,
    maxSecondarySections,
  );
  const actualSecondaryCount = sections.filter(
    (section) => section.kind === "secondary_signal",
  ).length;
  if (actualSecondaryCount < expectedSecondaryCount) {
    throw new Error(
      `Reader summary narrative covered ${actualSecondaryCount} of ${expectedSecondaryCount} planned secondary signals`,
    );
  }
};

const narrativeDiagnostics = (params: {
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

const canonicalNarrativeOrder = (
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

const displayLabel = (section: ReaderSummaryNarrativeSection): string =>
  section.kind === "main_signal" ? "Main signal" : "Why it matters";
