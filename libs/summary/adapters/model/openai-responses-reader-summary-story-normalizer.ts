import type {
  ReaderSummaryCitation,
  ReaderSummaryTopStory,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { primaryReaderSummaryEvidence } from "../../domain";
import {
  knownStringSubset,
  uniqueNonEmptyStrings,
} from "./openai-responses-reader-summary-json";


export const normalizeTopStories = (
  values: readonly Record<string, unknown>[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopStory[] => {
  if (input.dailyEditorialPlan !== undefined) {
    return normalizeDailyEditorialStories(values, input, citationMap);
  }
  if (input.evidence.editorialSlate?.top.length === 0 ||
      (input.evidence.editorialSlate === undefined &&
        input.coveragePlan.lead === undefined)) {
    return [];
  }

  const knownClusterIds = new Set(
    input.evidence.clusters.map((cluster) => cluster.id),
  );
  const clusterById = new Map(
    input.evidence.clusters.map((cluster) => [cluster.id, cluster] as const),
  );
  const citationById = new Map(
    citationMap.map((citation) => [citation.citationId, citation] as const),
  );
  const knownCitationIds = new Set(citationById.keys());
  const clusterByFeedItemId = clusterIdByFeedItemId(input);
  const repaired = values
    .map(normalizeTopStory)
    .flatMap((story): readonly ReaderSummaryTopStory[] => {
      const citationIds = knownStringSubset(
        story.citationIds,
        knownCitationIds,
      );
      if (citationIds.length === 0) {
        return [];
      }

      const citedClusterIds = clusterIdsFromCitations(
        citationIds,
        citationById,
        clusterByFeedItemId,
      );
      if (citedClusterIds.length > 1) {
        return [];
      }

      const declaredClusterId = knownClusterIds.has(story.storyClusterId)
        ? story.storyClusterId
        : undefined;
      const citedClusterId = citedClusterIds[0];
      if (
        declaredClusterId !== undefined &&
        citedClusterId !== undefined &&
        declaredClusterId !== citedClusterId
      ) {
        return [];
      }

      const storyClusterId = declaredClusterId ?? citedClusterId;
      if (storyClusterId === undefined) {
        return [];
      }

      const cluster = clusterById.get(storyClusterId);
      if (cluster === undefined) {
        return [];
      }
      const providerKeys = uniqueNonEmptyStrings([
        ...story.providerKeys,
        ...cluster.providerKeys,
      ]);
      const completedCitationIds = completeClusterCitationCoverage({
        citationIds,
        providerKeys,
        cluster,
        citationById,
      });
      if (completedCitationIds.length === 0) {
        return [];
      }

      return [
        {
          ...story,
          storyClusterId,
          interestIds: uniqueNonEmptyStrings([
            ...story.interestIds,
            ...cluster.interestIds,
          ]),
          providerKeys: providerKeysCoveredByCitations(
            providerKeys,
            completedCitationIds,
            citationById,
          ),
          citationIds: completedCitationIds,
        },
      ];
    });

  const normalized =
    repaired.length === 0 ? fallbackTopStories(input, citationMap) : repaired;
  if (input.evidence.editorialSlate !== undefined) {
    return immutableEditorialSlateTopStories(
      normalized,
      input,
      citationMap,
    );
  }
  const coverageComplete = ensureCoveragePlanStories(
    normalized,
    input,
    citationMap,
  );

  return topUpTopStories(coverageComplete, input, citationMap).slice(
    0,
    input.policy.maxStories,
  );
};

/** The model cannot backfill topics from unplanned context in the new profile. */
import {
  clusterIdByFeedItemId,
  clusterIdsFromCitations,
  completeClusterCitationCoverage,
  providerKeysCoveredByCitations,
} from "./openai-responses-reader-summary-story-citations";
export { clusterIdFromCitations } from "./openai-responses-reader-summary-story-citations";
import { normalizeTopStory } from "./openai-responses-reader-summary-story-input";
import {
  fallbackTopStories,
  immutableEditorialSlateTopStories,
  topUpTopStories,
  ensureCoveragePlanStories,
} from "./openai-responses-reader-summary-story-fallback";

const normalizeDailyEditorialStories = (
  values: readonly Record<string, unknown>[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopStory[] => {
  const plan = input.dailyEditorialPlan;
  const frozen = input.evidence.dailyGenerationInput;
  if (plan === undefined || frozen === undefined || values.length !== plan.topics.length) {
    throw new Error("Daily editorial stories must match the plan");
  }
  const byFeed = new Map(frozen.selected.map(item => [item.feedItemId, item] as const));
  const byCitation = new Map(citationMap.map(item => [item.citationId, item] as const));
  const evidenceById = new Map(primaryReaderSummaryEvidence(input.evidence).selectedEvidence
    .map(item => [item.feedItemId, item] as const));
  return values.map((raw, index): ReaderSummaryTopStory => {
    const topic = plan.topics[index]!;
    const anchor = byFeed.get(topic.feedItemIds[0]!);
    const story = normalizeTopStory(raw);
    if (anchor === undefined || story.storyClusterId !== anchor.storyId ||
        story.readerReasonProvenance?.kind !== "model" ||
        story.citationIds.length !== 1 ||
        byCitation.get(story.citationIds[0]!)?.feedItemId !== anchor.feedItemId) {
      throw new Error("Daily editorial story is missing or cites an unplanned source");
    }
    const evidence = evidenceById.get(anchor.feedItemId);
    if (evidence === undefined) throw new Error("Daily editorial story evidence missing");
    return { ...story, interestIds: [evidence.interestId],
      providerKeys: [evidence.providerKey] };
  });
};
