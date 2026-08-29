import type {
  ReaderSummaryCitation,
  ReaderSummaryCoverageMode,
  ReaderSummaryNarrativeSection,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";

export type ReaderSummaryNarrativeCoverage = {
  readonly mode: ReaderSummaryCoverageMode;
  readonly leadClusterId: string | undefined;
  readonly leadCitationIds: ReadonlySet<string>;
  readonly allowedLeadCitationIds: ReadonlySet<string>;
  readonly allowedNarrativeCitationIds: ReadonlySet<string>;
  readonly secondaryCitationIds: ReadonlyMap<string, ReadonlySet<string>>;
};

export const buildReaderSummaryNarrativeCoverage = (
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): ReaderSummaryNarrativeCoverage => {
  const citationByFeedItemId = new Map(
    citationMap.map(
      (citation) => [citation.feedItemId, citation.citationId] as const,
    ),
  );
  const plan = input.coveragePlan;
  const citationIdsFor = (feedItemIds: readonly string[]) =>
    new Set(
      feedItemIds
        .map((feedItemId) => citationByFeedItemId.get(feedItemId))
        .filter((id): id is string => id !== undefined),
    );
  const leadCitationIds = citationIdsFor(plan.lead?.feedItemIds ?? []);
  const secondaryCitationIds = new Map(
    plan.secondary.map((item) => [
      item.clusterId,
      citationIdsFor(item.feedItemIds),
    ]),
  );
  const allowedNarrativeCitationIds = new Set([
    ...leadCitationIds,
    ...[...secondaryCitationIds.values()].flatMap((ids) => [...ids]),
  ]);

  return {
    mode: plan.mode,
    leadClusterId: plan.lead?.clusterId,
    leadCitationIds,
    allowedLeadCitationIds:
      plan.mode === "daily_synthesis"
        ? allowedNarrativeCitationIds
        : leadCitationIds,
    allowedNarrativeCitationIds,
    secondaryCitationIds,
  };
};

export const isValidReaderSummaryNarrativeLead = (
  citationIds: readonly string[],
  coverage: ReaderSummaryNarrativeCoverage,
): boolean => {
  if (
    citationIds.length === 0 ||
    !citationIds.every((id) => coverage.allowedLeadCitationIds.has(id))
  ) {
    return false;
  }
  if (coverage.mode === "single_story") {
    return citationIds.every((id) => coverage.leadCitationIds.has(id));
  }

  return (
    citationIds.some((id) => coverage.leadCitationIds.has(id)) &&
    [...coverage.secondaryCitationIds.values()].some((allowed) =>
      citationIds.some((id) => allowed.has(id)),
    )
  );
};

export const buildReaderSummaryNarrativeCitationGuard =
  (
    coverage: ReaderSummaryNarrativeCoverage,
    eligibleWatchCitationIds: ReadonlySet<string>,
  ): ((
    kind: ReaderSummaryNarrativeSection["kind"] | undefined,
    citationIds: readonly string[],
  ) => boolean) =>
  (kind, citationIds) => {
    if (kind === "watch") {
      return citationIds.every((id) => eligibleWatchCitationIds.has(id));
    }
    if (kind === "main_signal" || kind === "why_it_matters") {
      return citationIds.every((id) =>
        coverage.allowedNarrativeCitationIds.has(id),
      );
    }
    return true;
  };
